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
  total_time_minutes: number | null;
  status: string;
  image_path: string | null;
  consecutive_missed_days: number;
  task_date: string;
  original_date: string;
  local_date: string;
}

interface FutureTask {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
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
    title:                   data.title as string,
    description:             (data.description as string | null) ?? null,
    start_time:              data.startTime as string,
    end_time:                (data.endTime as string | null) ?? null,
    total_time_minutes:      (data.totalTimeMinutes as number | null) ?? null,
    status:                  data.status as string,
    image_path:              (data.imagePath as string | null) ?? null,
    consecutive_missed_days: (data.consecutiveMissedDays as number) ?? 0,
    task_date:               data.taskDate as string,
    original_date:           data.originalDate as string,
    local_date:              (data.localDate as string) ?? (data.taskDate as string),
  };
}

function fsDocToFutureTask(id: string, data: Record<string, unknown>): FutureTask {
  return {
    id,
    title:         data.title as string,
    description:   (data.description as string | null) ?? null,
    start_time:    data.startTime as string,
    task_date:     data.taskDate as string,
    original_date: data.originalDate as string,
    status:        data.status as string,
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
      where('status', '==', 'pending'),
      where('taskDate', '<', today),
    );
    const snap = await getDocs(q);
    if (snap.empty) return false;

    const todayMs = new Date(today + 'T00:00:00').getTime();
    const batch   = writeBatch(firebaseDb);
    const now     = new Date().toISOString();

    snap.docs.forEach((d) => {
      const data         = d.data();
      const origDate     = data.originalDate as string;
      const origMs       = new Date(origDate + 'T00:00:00').getTime();
      const daysDiff     = Math.max(0, Math.floor((todayMs - origMs) / 86_400_000));
      const nowIso       = now;
      batch.update(d.ref, {
        taskDate:              today,
        localDate:             today,
        consecutiveMissedDays: daysDiff,
        updatedAt:             nowIso,
      });
    });

    await batch.commit();
    return true;
  } catch (err) {
    console.error('[useTasksData] Carry-forward error:', err);
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
      // ── Show cached IndexedDB data immediately ──
      if (!sessionCache.tasks) {
        try {
          const cached = await getOfflineTasks();
          if (cached.length > 0 && isMounted.current) {
            const tz = sessionCache.userTimezone ?? 'UTC';
            const today = getTodayInTimezone(tz);
            setState((prev) => ({
              ...prev,
              tasks:   cached.filter((t) => t.task_date === today) as unknown as Task[],
              loading: false,
            }));
          }
        } catch { /* IndexedDB unavailable */ }
      }

      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) {
        if (isMounted.current) setState((prev) => ({ ...prev, loading: false, error: 'Not authenticated' }));
        return;
      }

      // Fetch profile for timezone
      const profileSnap = await getDoc(userProfileDoc(uid));
      const timezone     = (profileSnap.data()?.timezone as string | undefined) ?? 'UTC';
      const today        = getTodayInTimezone(timezone);

      if (isMounted.current) setState((prev) => ({ ...prev, userTimezone: timezone }));

      // Fetch today's tasks + future tasks in parallel
      const [todaySnap, futureSnap] = await Promise.all([
        getDocs(
          query(
            collection(firebaseDb, `users/${uid}/tasks`),
            where('taskDate', '==', today),
            orderBy('startTime', 'asc'),
            limit(100),
          ),
        ),
        getDocs(
          query(
            collection(firebaseDb, `users/${uid}/tasks`),
            where('taskDate', '>', today),
            orderBy('taskDate', 'asc'),
            orderBy('startTime', 'asc'),
            limit(50),
          ),
        ),
      ]);

      const tasks       = todaySnap.docs.map((d) => fsDocToTask(d.id, d.data() as Record<string, unknown>));
      const futureTasks = futureSnap.docs.map((d) => fsDocToFutureTask(d.id, d.data() as Record<string, unknown>));

      // Update session cache
      sessionCache.tasks        = tasks;
      sessionCache.futureTasks  = futureTasks;
      sessionCache.userTimezone = timezone;
      sessionCache.lastFetch    = now;

      // Persist to IndexedDB
      try {
        const allForOffline: OfflineTask[] = [...tasks, ...futureTasks].map((t): OfflineTask => ({
          id:                      t.id,
          title:                   t.title,
          description:             t.description ?? null,
          start_time:              t.start_time,
          end_time:                ('end_time' in t ? t.end_time : null) ?? null) as string | null,
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
        setState({ tasks, futureTasks, userTimezone: timezone, loading: false, error: null });
      }

      // Run carry-forward after UI update (non-blocking)
      carryForwardTasks(uid, today).then(async (didCarry) => {
        if (!didCarry || !isMounted.current) return;
        const refreshSnap = await getDocs(
          query(
            collection(firebaseDb, `users/${uid}/tasks`),
            where('taskDate', '==', today),
            orderBy('startTime', 'asc'),
            limit(100),
          ),
        );
        const refreshed = refreshSnap.docs.map((d) => fsDocToTask(d.id, d.data() as Record<string, unknown>));
        sessionCache.tasks     = refreshed;
        sessionCache.lastFetch = Date.now();
        if (isMounted.current) setState((prev) => ({ ...prev, tasks: refreshed }));
      });

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
      const today   = getTodayInTimezone(state.userTimezone);
      const snap    = await getDocs(
        query(
          collection(firebaseDb, `users/${uid}/tasks`),
          where('taskDate', '==', today),
          orderBy('startTime', 'asc'),
          limit(100),
        ),
      );
      const tasks   = snap.docs.map((d) => fsDocToTask(d.id, d.data() as Record<string, unknown>));
      sessionCache.tasks     = tasks;
      sessionCache.lastFetch = Date.now();
      if (isMounted.current) setState((prev) => ({ ...prev, tasks }));
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
