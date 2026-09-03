import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getOfflineTasks,
  getOfflineFutureTasks,
  saveTasksOffline,
  type OfflineTask,
} from "@/utils/offlineStorage";

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

// Lighter interface for future tasks (subset of fields)
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

// Session cache to avoid refetching when navigating back
const sessionCache: {
  tasks: Task[] | null;
  futureTasks: FutureTask[] | null;
  userTimezone: string | null;
  lastFetch: number | null;
} = {
  tasks: null,
  futureTasks: null,
  userTimezone: null,
  lastFetch: null,
};

const CACHE_TTL = 30000; // 30 seconds cache validity

export function useTasksData() {
  const [state, setState] = useState<TasksDataState>({
    tasks: sessionCache.tasks || [],
    futureTasks: sessionCache.futureTasks || [],
    loading: !sessionCache.tasks,
    userTimezone: sessionCache.userTimezone || "UTC",
    error: null,
  });

  const isMounted = useRef(true);
  const isInitializing = useRef(false);

  const getTodayInTimezone = useCallback((timezone: string) => {
    const todayFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return todayFormatter.format(new Date());
  }, []);

  const fetchAllData = useCallback(async (forceRefresh = false) => {
    // Check cache validity
    const now = Date.now();
    if (
      !forceRefresh &&
      sessionCache.lastFetch &&
      now - sessionCache.lastFetch < CACHE_TTL &&
      sessionCache.tasks
    ) {
      if (isMounted.current) {
        setState({
          tasks: sessionCache.tasks,
          futureTasks: sessionCache.futureTasks || [],
          userTimezone: sessionCache.userTimezone || "UTC",
          loading: false,
          error: null,
        });
      }
      return;
    }

    if (isInitializing.current) return;
    isInitializing.current = true;

    try {
      // ── Offline-first: show cached IndexedDB data immediately ──
      if (!sessionCache.tasks) {
        try {
          const cachedTasks = await getOfflineTasks();
          if (cachedTasks.length > 0 && isMounted.current) {
            setState(prev => ({
              ...prev,
              tasks: cachedTasks.filter(t => t.task_date === getTodayInTimezone(prev.userTimezone)) as Task[],
              loading: false,
            }));
          }
        } catch { /* IndexedDB may not be available */ }
      }

      // Step 1: Get user and profile in ONE call
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (isMounted.current) {
          setState(prev => ({ ...prev, loading: false, error: "Not authenticated" }));
        }
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .maybeSingle();

      const timezone = profile?.timezone || "UTC";
      const today = getTodayInTimezone(timezone);

      // Update timezone immediately for faster perceived load
      if (isMounted.current) {
        setState(prev => ({ ...prev, userTimezone: timezone }));
      }

      // Step 2: Fetch tasks FIRST (don't wait for carry-forward)
      const [todayTasksResult, futureTasksResult] = await Promise.all([
        // Fetch today's tasks
        supabase
          .from("tasks")
          .select("id, title, description, start_time, end_time, total_time_minutes, status, image_path, consecutive_missed_days, task_date, original_date, local_date")
          .eq("user_id", user.id)
          .eq("task_date", today)
          .order("start_time", { ascending: true })
          .limit(100),
        // Fetch future tasks
        supabase
          .from("tasks")
          .select("id, title, description, start_time, task_date, original_date, status, image_path")
          .eq("user_id", user.id)
          .gt("task_date", today)
          .order("task_date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(50),
      ]);

      const tasks = todayTasksResult.data || [];
      const futureTasks = futureTasksResult.data || [];

      // Update cache
      sessionCache.tasks = tasks;
      sessionCache.futureTasks = futureTasks;
      sessionCache.userTimezone = timezone;
      sessionCache.lastFetch = now;

      // ── Persist to IndexedDB for offline access ──
      try {
        await saveTasksOffline([...tasks, ...futureTasks] as OfflineTask[]);
      } catch { /* IndexedDB may not be available */ }

      if (isMounted.current) {
        setState({
          tasks,
          futureTasks,
          userTimezone: timezone,
          loading: false,
          error: null,
        });
      }

      // Carry-forward runs AFTER UI update (non-blocking).
      // Only re-fetches today's tasks when carry-forward actually moved records.
      carryForwardTasks(user.id, today).then((didCarry) => {
        if (didCarry && isMounted.current) {
          supabase
            .from("tasks")
            .select("id, title, description, start_time, end_time, total_time_minutes, status, image_path, consecutive_missed_days, task_date, original_date, local_date")
            .eq("user_id", user.id)
            .eq("task_date", today)
            .order("start_time", { ascending: true })
            .limit(100)
            .then(({ data }) => {
              if (data && isMounted.current) {
                sessionCache.tasks = data;
                setState(prev => ({ ...prev, tasks: data }));
              }
            });
        }
      });
    } catch (error) {
      console.error("Error fetching tasks:", error);
      // ── Offline fallback: try IndexedDB before surfacing an error ──
      try {
        const tz = sessionCache.userTimezone || "UTC";
        const today = getTodayInTimezone(tz);
        const [cachedToday, cachedFuture] = await Promise.all([
          getOfflineTasks(today),
          getOfflineFutureTasks(today),
        ]);
        if (isMounted.current) {
          if (cachedToday.length > 0 || cachedFuture.length > 0) {
            setState({
              tasks: cachedToday as Task[],
              futureTasks: cachedFuture as FutureTask[],
              userTimezone: tz,
              loading: false,
              error: null,
            });
          } else {
            setState(prev => ({
              ...prev,
              loading: false,
              error: error instanceof Error ? error.message : "Failed to fetch tasks",
            }));
          }
        }
      } catch {
        if (isMounted.current) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : "Failed to fetch tasks",
          }));
        }
      }
    } finally {
      isInitializing.current = false;
    }
  }, [getTodayInTimezone]);

  // Lightweight refresh for just today's tasks (after completion)
  const refreshTasks = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = getTodayInTimezone(state.userTimezone);

      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, description, start_time, end_time, total_time_minutes, status, image_path, consecutive_missed_days, task_date, original_date, local_date")
        .eq("user_id", user.id)
        .eq("task_date", today)
        .order("start_time", { ascending: true })
        .limit(100);

      if (error) throw error;

      sessionCache.tasks = data || [];
      sessionCache.lastFetch = Date.now();

      if (isMounted.current) {
        setState(prev => ({ ...prev, tasks: data || [] }));
      }
    } catch (error) {
      console.error("Error refreshing tasks:", error);
    }
  }, [state.userTimezone, getTodayInTimezone]);

  useEffect(() => {
    isMounted.current = true;
    fetchAllData();

    return () => {
      isMounted.current = false;
    };
  }, [fetchAllData]);

  return {
    ...state,
    refreshTasks,
    forceRefresh: () => fetchAllData(true),
  };
}

// Returns true if any tasks were actually carried forward (caller uses this
// to decide whether to re-fetch today's list).  Uses a single batched UPDATE
// instead of N individual requests to avoid connection exhaustion.
async function carryForwardTasks(userId: string, today: string): Promise<boolean> {
  try {
    const { data: pendingTasks, error: fetchError } = await supabase
      .from("tasks")
      .select("id, original_date, consecutive_missed_days")
      .eq("user_id", userId)
      .eq("status", "pending")
      .lt("task_date", today);

    if (fetchError) throw fetchError;
    if (!pendingTasks || pendingTasks.length === 0) return false;

    const todayDateLocal = new Date(today + "T00:00:00");

    // Build the per-task consecutive_missed_days values and collect the ids
    // that actually need updating.  We use a single UPDATE … IN (ids) for the
    // task_date / local_date flip, and individual updates only where the
    // consecutive_missed_days value differs from what is already stored.
    const needsUpdate = pendingTasks.map((task) => {
      const originalDateLocal = new Date(task.original_date + "T00:00:00");
      const daysDiff = Math.floor(
        (todayDateLocal.getTime() - originalDateLocal.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: task.id,
        newConsecutiveDays: Math.max(0, daysDiff),
        currentConsecutiveDays: task.consecutive_missed_days,
      };
    });

    const ids = needsUpdate.map((t) => t.id);

    // Single query to move task_date and local_date forward for all overdue tasks.
    const { error: dateUpdateError } = await supabase
      .from("tasks")
      .update({ task_date: today, local_date: today })
      .in("id", ids);

    if (dateUpdateError) throw dateUpdateError;

    // Only issue individual consecutive_missed_days updates when the value
    // actually changed — avoids redundant writes on tasks seen before.
    const consecutiveUpdates = needsUpdate
      .filter((t) => t.newConsecutiveDays !== t.currentConsecutiveDays)
      .map((t) =>
        supabase
          .from("tasks")
          .update({ consecutive_missed_days: t.newConsecutiveDays })
          .eq("id", t.id)
      );

    if (consecutiveUpdates.length > 0) {
      await Promise.all(consecutiveUpdates);
    }

    return true;
  } catch (error) {
    console.error("Carry-forward error:", error);
    return false;
  }
}

// Clear cache when needed (e.g., after adding a task)
export function clearTasksCache() {
  sessionCache.tasks = null;
  sessionCache.futureTasks = null;
  sessionCache.lastFetch = null;
}
