import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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

      // Step 2: Run carry-forward + fetch tasks in PARALLEL
      const [, todayTasksResult, futureTasksResult] = await Promise.all([
        // Carry forward overdue tasks (fire and forget)
        carryForwardTasks(user.id, today),
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

      if (isMounted.current) {
        setState({
          tasks,
          futureTasks,
          userTimezone: timezone,
          loading: false,
          error: null,
        });
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to fetch tasks",
        }));
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

// Optimized carry-forward - only update if needed
async function carryForwardTasks(userId: string, today: string) {
  try {
    const { data: pendingTasks, error: fetchError } = await supabase
      .from("tasks")
      .select("id, original_date, consecutive_missed_days")
      .eq("user_id", userId)
      .eq("status", "pending")
      .lt("task_date", today);

    if (fetchError) throw fetchError;

    if (pendingTasks && pendingTasks.length > 0) {
      const updates = pendingTasks.map((task) => {
        const originalDateLocal = new Date(task.original_date + 'T00:00:00');
        const todayDateLocal = new Date(today + 'T00:00:00');
        const daysDiff = Math.floor(
          (todayDateLocal.getTime() - originalDateLocal.getTime()) / (1000 * 60 * 60 * 24)
        );
        const newConsecutiveDays = Math.max(0, daysDiff);

        return supabase
          .from("tasks")
          .update({
            local_date: today,
            task_date: today,
            consecutive_missed_days: newConsecutiveDays,
          })
          .eq("id", task.id);
      });

      await Promise.all(updates);
    }
  } catch (error) {
    console.error("Carry-forward error:", error);
  }
}

// Clear cache when needed (e.g., after adding a task)
export function clearTasksCache() {
  sessionCache.tasks = null;
  sessionCache.futureTasks = null;
  sessionCache.lastFetch = null;
}
