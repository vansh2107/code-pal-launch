// @ts-nocheck
/**
 * src/hooks/useTasksData.tsx — Firestore task data hook
 *
 * Replaces the Supabase version. Public API is identical:
 *   { tasks, futureTasks, loading, userTimezone, error, refreshTasks, forceRefresh }
 *   clearTasksCache()
 *
 * Strategy
 * ─────────
 * - Reads tasks from Firestore using the Firebase Web SDK.
 * - Firestore field names are camelCase; the hook maps them back to
 *   snake_case so every consumer page continues to work unchanged.
 * - Offline-first: IndexedDB is shown immediately while Firestore loads.
 * - Session cache (30 s TTL) prevents re-fetching on tab navigation.
 * - Carry-forward logic runs client-side, same as before.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { firebaseDb, firebaseAuth } from '@/integrations/firebase/client';
import { userProfileDoc } from '@/integrations/firebase/firestore';
import { getDoc } from 'firebase/firestore';
import {
  getOfflineTasks,
  getOfflineFutureTasks,
  saveTasksOffline,
  reconcileOfflineTasksForDate,
  type OfflineTask,
} from '@/utils/offlineStorage';

// ---------------------------------------------------------------------------
// Types (snake_case — matches what pages expect)
// ---------------------------------------------------------------------------

interface Task {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  due_date: string | null;
  total_time_minutes: number | null;
  status: string;
  image_path: string | null;
  consecutive_missed_days: number;
  task_date: string;
  original_date: string;
  local_date: string;
  last_overdue_alert_sent: string | null;
}

interface FutureTask {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  due_date: string | null;
  task_date: string;
  original_date: string;
  status: string;
  image_path: string | null;
}

interface TasksDataState {
  tasks: Task[];
  futureTasks: FutureTask[];
  loading: boolean;
  userTimezone: string;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Session cache
// ---------------------------------------------------------------------------

const sessionCache: {
  tasks: Task[] | null;
  futureTasks: FutureTask[] | null;
  userTimezone: string | null;
  lastFetch: number | null;
} = { tasks: null, futureTasks: null, userTimezone: null, lastFetch: null };

const CACHE_TTL = 30_000;

export function clearTasksCache() {
  sessionCache.tasks = null;
  sessionCache.futureTasks = null;
  sessionCache.lastFetch = null;
}

// ---------------------------------------------------------------------------
// Firestore → snake_case mapper
// ---------------------------------------------------------------------------

function fsDocToTask(id: string, data: Record<string, unknown>): Task {
  return {
    id,
    title:                   (data.title as string) ?? '',
    description:             (data.description as string | null) ?? null,
    start_time:              (data.startTime as string) ?? (data.start_time as string) ?? new Date().toISOString(),
    end_time:                (data.endTime as string | null) ?? (data.end_time as string | null) ?? null,
    due_date:                (data.dueDate as string | null) ?? (data.due_date as string | null) ?? null,
    total_time_minutes:      (data.totalTimeMinutes as number | null) ?? null,
    status:                  (data.status as string) ?? 'pending',
    image_path:              (data.imagePath as string | null) ?? (data.image_path as string | null) ?? null,
    consecutive_missed_days: (data.consecutiveMissedDays as number) ?? 0,
    task_date:               (data.taskDate as string) ?? (data.task_date as string) ?? '',
    original_date:           (data.originalDate as string) ?? (data.original_date as string) ?? (data.taskDate as string) ?? '',
    local_date:              (data.localDate as string) ?? (data.taskDate as string) ?? '',
    last_overdue_alert_sent: (data.lastOverdueAlertSent as string | null) ?? null,
  };
}

function fsDocToFutureTask(id: string, data: Record<string, unknown>): FutureTask {
  return {
    id,
    title:         (data.title as string) ?? '',
    description:   (data.description as string | null) ?? null,
    start_time:    (data.startTime as string) ?? (data.start_time as string) ?? new Date().toISOString(),
    due_date:      (data.dueDate as string | null) ?? (data.due_date as string | null) ?? null,
    task_date:     (data.taskDate as string) ?? (data.task_date as string) ?? '',
    original_date: (data.originalDate as string) ?? (data.original_date as string) ?? '',
    status:        (data.status as string) ?? 'pending',
    image_path:    (data.imagePath as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Today helper
// ---------------------------------------------------------------------------

function getTodayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// Carry-forward (Firestore version)
// ---------------------------------------------------------------------------

async function carryForwardTasks(uid: string, today: string): Promise<boolean> {
  try {
    const q = query(
      collection(firebaseDb, `users/${uid}/tasks`),
      where('taskDate', '<', today),
    );
    const snap = await getDocs(q);
    if (snap.empty) return false;

    const activeDocs = snap.docs.filter((d) => {
      const status = d.data().status as string;
      return status !== 'completed' && status !== 'cancelled' && status !== 'rejected';
    });

    if (activeDocs.length === 0) return false;

    const todayMs = new Date(today + 'T00:00:00').getTime();
    const batch   = writeBatch(firebaseDb);
    const now     = new Date().toISOString();

    activeDocs.forEach((d) => {
      const data     = d.data();
      const origDate = (data.originalDate as string) || (data.taskDate as string);
      const origMs   = new Date(origDate + 'T00:00:00').getTime();
      const daysDiff = Math.max(1, Math.floor((todayMs - origMs) / 86_400_000));
      batch.update(d.ref, {
        taskDate:              today,
        localDate:             today,
        status:                'overdue',
        consecutiveMissedDays: daysDiff,
        updatedAt:             now,
      });
    });

    await batch.commit();
    return true;
  } catch (err) {
    console.warn('[useTasksData] Carry-forward warning:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTasksData() {
  const [state, setState] = useState<TasksDataState>({
    tasks:        sessionCache.tasks        ?? [],
    futureTasks:  sessionCache.futureTasks  ?? [],
    loading:      !sessionCache.tasks,
    userTimezone: sessionCache.userTimezone ?? 'UTC',
    error:        null,
  });

  const isMounted       = useRef(true);
  const isInitializing  = useRef(false);

  const fetchAllData = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    if (
      !forceRefresh &&
      sessionCache.lastFetch &&
      now - sessionCache.lastFetch < CACHE_TTL &&
      sessionCache.tasks
    ) {
      if (isMounted.current) {
        setState({
          tasks:        sessionCache.tasks,
          futureTasks:  sessionCache.futureTasks ?? [],
          userTimezone: sessionCache.userTimezone ?? 'UTC',
          loading:      false,
          error:        null,
        });
      }
      return;
    }

    if (isInitializing.current) return;
    isInitializing.current = true;

    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) {
        if (isMounted.current) setState((prev) => ({ ...prev, loading: false, error: 'Not authenticated' }));
        return;
      }

      // Fetch profile for timezone
      const deviceTz    = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const profileSnap = await getDoc(userProfileDoc(uid));
      const storedTz    = profileSnap.data()?.timezone as string | undefined;
      const timezone    = (storedTz && storedTz !== 'UTC') ? storedTz : deviceTz;
      const today       = getTodayInTimezone(timezone);

      if (isMounted.current) setState((prev) => ({ ...prev, userTimezone: timezone }));

      // Safely run carry-forward
      try {
        await carryForwardTasks(uid, today);
      } catch (cfErr) {
        console.warn('[useTasksData] carryForwardTasks non-fatal:', cfErr);
      }

      // Fetch all tasks for user cleanly without fragile composite index requirement
      const allSnap = await getDocs(collection(firebaseDb, `users/${uid}/tasks`));
      const allTasks = allSnap.docs.map((d) => fsDocToTask(d.id, d.data() as Record<string, unknown>));

      const activeTasks = allTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'rejected');
      const todayTasks  = activeTasks.filter((t) => !t.task_date || t.task_date <= today);
      const futureTasks = activeTasks.filter((t) => t.task_date && t.task_date > today) as unknown as FutureTask[];

      todayTasks.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      futureTasks.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      // Update session cache
      sessionCache.tasks        = todayTasks;
      sessionCache.futureTasks  = futureTasks;
      sessionCache.userTimezone = timezone;
      sessionCache.lastFetch    = now;

      // Persist to IndexedDB
      try {
        const allForOffline: OfflineTask[] = [...todayTasks, ...futureTasks].map((t) => ({
          id:                      t.id,
          title:                   t.title,
          description:             t.description ?? null,
          start_time:              t.start_time,
          end_time:                ('end_time' in t ? t.end_time : null) ?? null,
          total_time_minutes:      ('total_time_minutes' in t ? t.total_time_minutes : null) ?? null,
          status:                  t.status,
          image_path:              t.image_path ?? null,
          consecutive_missed_days: ('consecutive_missed_days' in t ? t.consecutive_missed_days : 0) ?? 0,
          task_date:               t.task_date,
          original_date:           t.original_date,
          local_date:              ('local_date' in t ? t.local_date : t.task_date) ?? t.task_date,
          user_id:                 uid,
          updated_at:              new Date().toISOString(),
        }));
        await saveTasksOffline(allForOffline);
      } catch { /* IndexedDB unavailable */ }

      if (isMounted.current) {
        setState({ tasks: todayTasks, futureTasks, userTimezone: timezone, loading: false, error: null });
      }

    } catch (error) {
      console.error('[useTasksData] Fetch error:', error);
      try {
        const tz    = sessionCache.userTimezone ?? 'UTC';
        const today = getTodayInTimezone(tz);
        const [cachedToday, cachedFuture] = await Promise.all([
          getOfflineTasks(today),
          getOfflineFutureTasks(today),
        ]);
        if (isMounted.current) {
          if (cachedToday.length > 0 || cachedFuture.length > 0) {
            setState({
              tasks:        cachedToday as unknown as Task[],
              futureTasks:  cachedFuture as unknown as FutureTask[],
              userTimezone: tz,
              loading:      false,
              error:        null,
            });
          } else {
            setState((prev) => ({
              ...prev,
              loading: false,
              error:   error instanceof Error ? error.message : 'Failed to fetch tasks',
            }));
          }
        }
      } catch {
        if (isMounted.current) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error:   error instanceof Error ? error.message : 'Failed to fetch tasks',
          }));
        }
      }
    } finally {
      isInitializing.current = false;
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) return;
      const today = getTodayInTimezone(state.userTimezone);
      const snap  = await getDocs(collection(firebaseDb, `users/${uid}/tasks`));
      const allTasks = snap.docs.map((d) => fsDocToTask(d.id, d.data() as Record<string, unknown>));
      const activeTasks = allTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'rejected');
      const todayTasks  = activeTasks.filter((t) => !t.task_date || t.task_date <= today);
      todayTasks.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      sessionCache.tasks     = todayTasks;
      sessionCache.lastFetch = Date.now();
      if (isMounted.current) setState((prev) => ({ ...prev, tasks: todayTasks }));
    } catch (err) {
      console.error('[useTasksData] refreshTasks error:', err);
    }
  }, [state.userTimezone]);

  useEffect(() => {
    isMounted.current = true;
    fetchAllData();
    return () => { isMounted.current = false; };
  }, [fetchAllData]);

  return { ...state, refreshTasks, forceRefresh: () => fetchAllData(true) };
}
