import { supabase } from "@/integrations/supabase/client";
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
} from "./offlineStorage";

type SyncStatus = "idle" | "syncing" | "error" | "success";
type SyncListener = (status: SyncStatus, message?: string) => void;

const listeners = new Set<SyncListener>();
let currentStatus: SyncStatus = "idle";

function notify(status: SyncStatus, message?: string) {
  currentStatus = status;
  listeners.forEach((fn) => fn(status, message));
}

export function onSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  // Send current status immediately
  listener(currentStatus);
  return () => listeners.delete(listener);
}

// ── Push pending offline changes to server ──
export async function pushPendingChanges(): Promise<number> {
  const items = await getPendingSyncItems();
  if (items.length === 0) return 0;

  let synced = 0;

  for (const item of items) {
    try {
      const table = item.table as
        | "tasks"
        | "documents"
        | "routines"
        | "routine_tasks"
        | "routine_task_slots"
        | "docvault_categories";

      if (item.action === "insert") {
        const { error } = await (supabase.from(table as any) as any)
          .insert(item.data as Record<string, unknown>);
        if (error) throw error;
      } else if (item.action === "update") {
        const { error } = await (supabase.from(table as any) as any)
          .update(item.data as Record<string, unknown>)
          .eq("id", item.record_id);
        if (error) throw error;
      } else if (item.action === "delete") {
        const { error } = await (supabase.from(table as any) as any)
          .delete()
          .eq("id", item.record_id);
        if (error) throw error;
      }

      await removePendingSync(item.id);
      synced++;
    } catch (err) {
      console.error(`Sync failed for ${item.id}:`, err);
      // Keep in queue for retry
    }
  }

  return synced;
}

// ── Pull latest data from server into IndexedDB ──
export async function pullLatestData(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const [tasksResult, docsResult, routinesResult, categoriesResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, description, start_time, end_time, total_time_minutes, status, image_path, consecutive_missed_days, task_date, original_date, local_date, user_id, updated_at")
      .eq("user_id", user.id)
      .order("task_date", { ascending: false })
      .limit(500),
    supabase
      .from("documents")
      .select("id, name, document_type, expiry_date, issuing_authority, category_detail, notes, image_path, user_id, updated_at, created_at, docvault_category_id, access_count, last_accessed_at")
      .eq("user_id", user.id)
      .limit(500),
    supabase
      .from("routines" as any)
      .select("*")
      .eq("user_id", user.id)
      .limit(200),
    supabase
      .from("docvault_categories")
      .select("*")
      .eq("user_id", user.id)
      .limit(200),
  ]);

  if (tasksResult.data) {
    await saveTasksOffline(tasksResult.data as OfflineTask[]);
  }
  if (docsResult.data) {
    await saveDocumentsOffline(docsResult.data as OfflineDocument[]);
  }
  if (categoriesResult.data) {
    await saveDocVaultCategoriesOffline(categoriesResult.data as OfflineDocVaultCategory[]);
  }

  // Pull routines bundle (routines + tasks + slots)
  if (routinesResult.data && (routinesResult.data as any[]).length > 0) {
    const routineRows = routinesResult.data as any[];
    const routineIds = routineRows.map((r) => r.id);

    const { data: taskRows } = await supabase
      .from("routine_tasks" as any)
      .select("*")
      .in("routine_id", routineIds);

    const taskIds = ((taskRows as any[]) || []).map((t: any) => t.id);
    let slotRows: any[] = [];
    if (taskIds.length > 0) {
      const { data } = await supabase
        .from("routine_task_slots" as any)
        .select("*")
        .in("task_id", taskIds);
      slotRows = (data as any[]) || [];
    }

    const slotMap: Record<string, any[]> = {};
    for (const s of slotRows) {
      (slotMap[s.task_id] ||= []).push(s);
    }
    const taskMap: Record<string, any[]> = {};
    for (const t of (taskRows as any[]) || []) {
      (taskMap[t.routine_id] ||= []).push({ ...t, slots: slotMap[t.id] || [] });
    }

    const bundles: OfflineRoutineBundle[] = routineRows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      name: r.name,
      icon: r.icon || "☀️",
      is_active: r.is_active !== false,
      created_at: r.created_at,
      updated_at: r.updated_at,
      tasks: taskMap[r.id] || [],
    }));
    await saveRoutinesOffline(bundles);
  } else if (routinesResult.data) {
    await saveRoutinesOffline([]);
  }

  await setMeta("lastSync", new Date().toISOString());
}

// ── Full sync: push then pull ──
export async function fullSync(): Promise<{ pushed: number }> {
  if (!navigator.onLine) {
    notify("error", "No internet connection");
    return { pushed: 0 };
  }

  notify("syncing");

  try {
    const pushed = await pushPendingChanges();
    await pullLatestData();
    notify("success", pushed > 0 ? `Synced ${pushed} offline change${pushed > 1 ? "s" : ""}` : "Data up to date");
    return { pushed };
  } catch (err) {
    console.error("Full sync error:", err);
    notify("error", "Sync failed");
    return { pushed: 0 };
  }
}

// ── Auto-sync on reconnect ──
let autoSyncRegistered = false;

export function registerAutoSync(): void {
  if (autoSyncRegistered) return;
  autoSyncRegistered = true;

  window.addEventListener("online", () => {
    // Small delay to let network stabilize
    setTimeout(() => fullSync(), 2000);
  });

  // Also sync on visibility change (app foregrounded)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      fullSync();
    }
  });
}
