/**
 * src/utils/syncEngine.ts — Firestore offline sync engine
 *
 * Replaces the Supabase push/pull sync with Firestore equivalents.
 * Public API is identical so App.tsx and useOfflineSync.tsx compile unchanged:
 *   onSyncStatus(listener)
 *   pushPendingChanges()
 *   pullLatestData()
 *   fullSync()
 *   registerAutoSync()
 *
 * Strategy
 * ─────────
 * Firestore SDK has built-in offline persistence (IndexedDB cache managed by
 * the SDK itself).  This engine therefore focuses on:
 *   1. Flushing the app's own pendingSync queue (writes queued while offline)
 *      directly to Firestore using the Admin-free client SDK.
 *   2. Pulling a fresh snapshot of all user collections into the app's own
 *      IndexedDB store (offlineStorage.ts) for legacy offline read paths.
 *   3. Registering online / visibility reconnect triggers.
 *
 * The pendingSync queue entries still use the same table-name strings
 * ("tasks", "documents", etc.) — they are mapped to Firestore collection
 * paths inside pushPendingChanges().
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
} from 'firebase/firestore';
import { firebaseDb, firebaseAuth } from '@/integrations/firebase/client';
import {
  getPendingSyncItems,
  removePendingSync,
  saveTasksOffline,
  saveDocumentsOffline,
  saveRoutinesOffline,
  saveDocVaultCategoriesOffline,
  setMeta,
  type OfflineTask,
  type OfflineDocument,
  type OfflineRoutineBundle,
  type OfflineDocVaultCategory,
} from './offlineStorage';

// ---------------------------------------------------------------------------
// Status bus (unchanged public API)
// ---------------------------------------------------------------------------

type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';
type SyncListener = (status: SyncStatus, message?: string) => void;

const listeners = new Set<SyncListener>();
let currentStatus: SyncStatus = 'idle';

function notify(status: SyncStatus, message?: string) {
  currentStatus = status;
  listeners.forEach((fn) => fn(status, message));
}

export function onSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Firestore path helpers
// ---------------------------------------------------------------------------

/**
 * Map a pendingSync table name to a Firestore collection path under the user.
 * Nested collections (routine_tasks, routine_task_slots) are handled
 * individually using the data payload for parent IDs.
 */
function firestoreCollectionPath(
  uid: string,
  table: string,
  data: Record<string, unknown>,
): string | null {
  switch (table) {
    case 'tasks':
      return `users/${uid}/tasks`;
    case 'documents':
      return `users/${uid}/documents`;
    case 'routines':
      return `users/${uid}/routines`;
    case 'docvault_categories':
      return `users/${uid}/docvault_categories`;
    case 'routine_tasks': {
      const routineId = data.routine_id as string | undefined;
      if (!routineId) return null;
      return `users/${uid}/routines/${routineId}/tasks`;
    }
    case 'routine_task_slots': {
      // Need both routine_id and task_id from data
      const routineId = data.routine_id as string | undefined;
      const taskId    = data.task_id    as string | undefined;
      if (!routineId || !taskId) return null;
      return `users/${uid}/routines/${routineId}/tasks/${taskId}/slots`;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Push pending offline changes to Firestore
// ---------------------------------------------------------------------------

export async function pushPendingChanges(): Promise<number> {
  const items = await getPendingSyncItems();
  if (items.length === 0) return 0;

  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) return 0;

  let synced = 0;

  for (const item of items) {
    try {
      const collPath = firestoreCollectionPath(uid, item.table, item.data);
      if (!collPath) {
        // Cannot resolve path — skip but keep in queue
        console.warn(`[syncEngine] Cannot resolve path for table "${item.table}" — skipping`);
        continue;
      }

      const docRef = doc(firebaseDb, collPath, item.record_id);

      if (item.action === 'insert') {
        await setDoc(docRef, { ...item.data, id: item.record_id }, { merge: false });
      } else if (item.action === 'update') {
        await updateDoc(docRef, item.data as Record<string, unknown>);
      } else if (item.action === 'delete') {
        await deleteDoc(docRef);
      }

      await removePendingSync(item.id);
      synced++;
    } catch (err) {
      console.error(`[syncEngine] Sync failed for ${item.id}:`, err);
      // Keep in queue for retry
    }
  }

  return synced;
}

// ---------------------------------------------------------------------------
// Pull latest data from Firestore into IndexedDB
// ---------------------------------------------------------------------------

export async function pullLatestData(): Promise<void> {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) return;

  const userBase = `users/${uid}`;

  // Tasks
  const tasksSnap = await getDocs(
    query(
      collection(firebaseDb, `${userBase}/tasks`),
      orderBy('taskDate', 'desc'),
      limit(500),
    ),
  );
  if (!tasksSnap.empty) {
    const tasks = tasksSnap.docs.map((d) => {
      const data = d.data();
      // Map camelCase Firestore fields back to snake_case for IndexedDB / legacy UI
      return {
        id:                      d.id,
        title:                   data.title,
        description:             data.description ?? null,
        start_time:              data.startTime,
        end_time:                data.endTime ?? null,
        total_time_minutes:      data.totalTimeMinutes ?? null,
        status:                  data.status,
        image_path:              data.imagePath ?? null,
        consecutive_missed_days: data.consecutiveMissedDays ?? 0,
        task_date:               data.taskDate,
        original_date:           data.originalDate,
        local_date:              data.localDate ?? data.taskDate,
        user_id:                 uid,
        updated_at:              data.updatedAt ?? new Date().toISOString(),
      } as OfflineTask;
    });
    await saveTasksOffline(tasks);
  }

  // Documents
  const docsSnap = await getDocs(
    query(collection(firebaseDb, `${userBase}/documents`), limit(500)),
  );
  if (!docsSnap.empty) {
    const docs = docsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id:                  d.id,
        name:                data.name,
        document_type:       data.documentType,
        expiry_date:         data.expiryDate ?? '',
        issuing_authority:   data.issuingAuthority ?? null,
        category_detail:     data.categoryDetail ?? null,
        notes:               data.notes ?? null,
        image_path:          data.imagePath ?? null,
        user_id:             uid,
        updated_at:          data.updatedAt ?? new Date().toISOString(),
        created_at:          data.createdAt,
        docvault_category_id: data.docvaultCategoryId ?? null,
        access_count:        data.accessCount ?? 0,
        last_accessed_at:    data.lastAccessedAt ?? null,
      } as OfflineDocument;
    });
    await saveDocumentsOffline(docs);
  }

  // DocVault categories
  const catsSnap = await getDocs(
    query(collection(firebaseDb, `${userBase}/docvault_categories`), limit(200)),
  );
  if (!catsSnap.empty) {
    const cats = catsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id:         d.id,
        user_id:    uid,
        name:       data.name,
        created_at: data.createdAt,
        updated_at: data.updatedAt,
      } as OfflineDocVaultCategory;
    });
    await saveDocVaultCategoriesOffline(cats);
  }

  // Routines (with nested tasks + slots)
  const routinesSnap = await getDocs(
    query(collection(firebaseDb, `${userBase}/routines`), limit(200)),
  );

  if (!routinesSnap.empty) {
    const bundles: OfflineRoutineBundle[] = [];

    for (const routineDoc of routinesSnap.docs) {
      const r = routineDoc.data();

      const tasksSnap2 = await getDocs(
        collection(firebaseDb, `${userBase}/routines/${routineDoc.id}/tasks`),
      );

      const tasks: OfflineRoutineBundle['tasks'] = [];
      for (const taskDoc of tasksSnap2.docs) {
        const t = taskDoc.data();
        const slotsSnap = await getDocs(
          collection(firebaseDb, `${userBase}/routines/${routineDoc.id}/tasks/${taskDoc.id}/slots`),
        );
        const slots = slotsSnap.docs.map((s) => {
          const sd = s.data();
          return {
            id:           s.id,
            task_id:      taskDoc.id,
            time:         sd.time,
            days_of_week: sd.daysOfWeek ?? [],
          };
        });
        tasks.push({
          id:         taskDoc.id,
          routine_id: routineDoc.id,
          name:       t.name,
          created_at: t.createdAt,
          slots,
        });
      }

      bundles.push({
        id:         routineDoc.id,
        user_id:    uid,
        name:       r.name,
        icon:       r.icon ?? '☀️',
        is_active:  r.isActive !== false,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
        tasks,
      });
    }

    await saveRoutinesOffline(bundles);
  } else {
    await saveRoutinesOffline([]);
  }

  await setMeta('lastSync', new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Full sync: push then pull
// ---------------------------------------------------------------------------

export async function fullSync(): Promise<{ pushed: number }> {
  if (!navigator.onLine) {
    notify('error', 'No internet connection');
    return { pushed: 0 };
  }

  notify('syncing');

  try {
    const pushed = await pushPendingChanges();
    await pullLatestData();
    notify(
      'success',
      pushed > 0 ? `Synced ${pushed} offline change${pushed > 1 ? 's' : ''}` : 'Data up to date',
    );
    return { pushed };
  } catch (err) {
    console.error('[syncEngine] Full sync error:', err);
    notify('error', 'Sync failed');
    return { pushed: 0 };
  }
}

// ---------------------------------------------------------------------------
// Auto-sync on reconnect / foreground
// ---------------------------------------------------------------------------

let autoSyncRegistered = false;

export function registerAutoSync(): void {
  if (autoSyncRegistered) return;
  autoSyncRegistered = true;

  window.addEventListener('online', () => {
    setTimeout(() => fullSync(), 2000);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      fullSync();
    }
  });
}
