import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface RoutineStep {
  id: string;
  routine_id: string;
  title: string;
  duration_minutes: number;
  sort_order: number;
  start_offset_minutes: number;
  reminder_type: string;
  step_start_time: string | null;
}

export interface RoutineSlot {
  id: string;
  routine_id: string;
  days_of_week: number[];
  start_time: string; // "HH:mm:ss"
}

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  category: string;
  icon: string;
  is_active: boolean;
  repeat_days: number[];
  start_time: string | null;
  end_time: string | null;
  repeat_type: string;
  mode: string;
  auto_adjust: boolean;
  notifications_enabled: boolean;
  created_at: string;
  steps?: RoutineStep[];
  slots?: RoutineSlot[];
}

export interface RoutineLog {
  id: string;
  routine_id: string;
  user_id: string;
  started_at: string;
  completed_at: string | null;
  current_step_index: number;
  status: string;
  execution_date: string;
  mode: string;
  auto_adjust: boolean;
  discipline_score: number;
}

export interface RoutineStepLog {
  id: string;
  routine_log_id: string;
  step_id: string;
  action: string;
  completed_at: string;
  scheduled_at: string | null;
  activated_at: string | null;
  delay_seconds: number;
}

export interface RoutineStreak {
  id: string;
  user_id: string;
  routine_id: string;
  current_streak: number;
  best_streak: number;
  last_completed_date: string | null;
  total_completions: number;
  total_skips: number;
  avg_discipline_score: number;
  avg_delay_seconds: number;
}

function calculateDisciplineScore(
  stepLogs: { action: string; delay_seconds: number }[]
): number {
  let score = 100;
  for (const log of stepLogs) {
    if (log.action === "skipped") score -= 15;
    else if (log.delay_seconds > 900) score -= 10;
    else if (log.delay_seconds > 300) score -= 5;
  }
  return Math.max(0, Math.min(100, score));
}

export function parseTimeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

export function resolveCurrentStepByTime(
  steps: RoutineStep[],
  completedStepIds: Set<string>,
  nowMinutes: number
): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (!step.step_start_time) continue;
    const stepMin = parseTimeToMinutes(step.step_start_time);
    if (stepMin <= nowMinutes && !completedStepIds.has(step.id)) {
      return i;
    }
  }
  for (let i = 0; i < steps.length; i++) {
    if (!completedStepIds.has(steps[i].id)) return i;
  }
  return steps.length;
}

const DAYS_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Get today's matching slot for a routine.
 * Returns the slot whose days_of_week includes today's day number (1=Mon..7=Sun).
 */
export function getTodaySlot(slots: RoutineSlot[]): RoutineSlot | null {
  const now = new Date();
  const day = now.getDay() === 0 ? 7 : now.getDay();
  return slots.find((s) => s.days_of_week.includes(day)) || null;
}

/**
 * Get the next upcoming slot (today or future).
 */
export function getNextSlotInfo(slots: RoutineSlot[]): { slot: RoutineSlot; dayLabel: string; isToday: boolean } | null {
  if (!slots || slots.length === 0) return null;
  const now = new Date();
  const todayDay = now.getDay() === 0 ? 7 : now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Check today first
  for (const slot of slots) {
    if (slot.days_of_week.includes(todayDay)) {
      const slotMin = parseTimeToMinutes(slot.start_time);
      if (slotMin > nowMin) {
        return { slot, dayLabel: "Today", isToday: true };
      }
    }
  }

  // Check future days (up to 7 days ahead)
  for (let offset = 1; offset <= 7; offset++) {
    const futureDay = ((todayDay - 1 + offset) % 7) + 1;
    for (const slot of slots) {
      if (slot.days_of_week.includes(futureDay)) {
        const label = offset === 1 ? "Tomorrow" : DAYS_LABELS[futureDay];
        return { slot, dayLabel: label, isToday: false };
      }
    }
  }
  return null;
}

export function useRoutines() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoutines = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("routines" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const routineIds = (data as any[])?.map((r: any) => r.id) || [];
      let stepsMap: Record<string, RoutineStep[]> = {};
      let slotsMap: Record<string, RoutineSlot[]> = {};

      if (routineIds.length > 0) {
        const [stepsResult, slotsResult] = await Promise.all([
          supabase
            .from("routine_steps" as any)
            .select("*")
            .in("routine_id", routineIds)
            .order("sort_order", { ascending: true }),
          supabase
            .from("routine_slots" as any)
            .select("*")
            .in("routine_id", routineIds),
        ]);

        if (!stepsResult.error && stepsResult.data) {
          for (const step of stepsResult.data as any[]) {
            if (!stepsMap[step.routine_id]) stepsMap[step.routine_id] = [];
            stepsMap[step.routine_id].push(step as RoutineStep);
          }
        }

        if (!slotsResult.error && slotsResult.data) {
          for (const slot of slotsResult.data as any[]) {
            if (!slotsMap[slot.routine_id]) slotsMap[slot.routine_id] = [];
            slotsMap[slot.routine_id].push(slot as RoutineSlot);
          }
        }
      }

      const routinesWithData = (data as any[])?.map((r: any) => ({
        ...r,
        steps: stepsMap[r.id] || [],
        slots: slotsMap[r.id] || [],
      })) as Routine[];

      setRoutines(routinesWithData || []);
    } catch (error) {
      console.error("Error fetching routines:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines]);

  const createRoutine = async (
    name: string,
    category: string,
    icon: string,
    steps: { title: string; duration_minutes: number; step_start_time: string }[],
    options?: {
      mode?: string;
      auto_adjust?: boolean;
      start_time?: string;
      repeat_days?: number[];
      notifications_enabled?: boolean;
      start_date?: string;
      slots?: { days_of_week: number[]; start_time: string }[];
    }
  ) => {
    if (!user) return null;
    try {
      // Compute all days from slots for backward compat
      const allDays = options?.slots
        ? [...new Set(options.slots.flatMap((s) => s.days_of_week))].sort()
        : options?.repeat_days || [1, 2, 3, 4, 5, 6, 7];

      const insertData: any = {
        user_id: user.id,
        name,
        category,
        icon,
        mode: options?.mode || "flexible",
        auto_adjust: options?.auto_adjust ?? true,
        notifications_enabled: options?.notifications_enabled ?? true,
        repeat_days: allDays,
      };
      if (options?.start_time) insertData.start_time = options.start_time;

      const { data: routine, error } = await supabase
        .from("routines" as any)
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      const routineId = (routine as any).id;

      // Insert slots
      if (options?.slots && options.slots.length > 0) {
        const slotsData = options.slots.map((s) => ({
          routine_id: routineId,
          days_of_week: s.days_of_week,
          start_time: s.start_time,
        }));
        await supabase.from("routine_slots" as any).insert(slotsData as any);
      }

      // Insert steps
      if (steps.length > 0) {
        let offsetAccum = 0;
        const stepsData = steps.map((s, i) => {
          const stepData = {
            routine_id: routineId,
            title: s.title,
            duration_minutes: s.duration_minutes,
            sort_order: i,
            start_offset_minutes: offsetAccum,
            step_start_time: s.step_start_time || null,
          };
          offsetAccum += s.duration_minutes;
          return stepData;
        });

        const { error: stepsError } = await supabase
          .from("routine_steps" as any)
          .insert(stepsData as any);

        if (stepsError) throw stepsError;
      }

      toast({ title: "Routine created! 🎯" });
      await fetchRoutines();
      return routineId;
    } catch (error) {
      console.error("Error creating routine:", error);
      toast({ title: "Failed to create routine", variant: "destructive" });
      return null;
    }
  };

  const toggleRoutineActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("routines" as any)
        .update({ is_active: isActive } as any)
        .eq("id", id);
      if (error) throw error;

      // If deactivating, clear today's notification logs to prevent future sends
      if (!isActive && user) {
        const today = new Date().toISOString().split("T")[0];
        await supabase
          .from("routine_notification_log" as any)
          .delete()
          .eq("routine_id", id)
          .eq("user_id", user.id);
      }

      setRoutines((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_active: isActive } : r))
      );
      toast({
        title: isActive ? "Routine activated ✅" : "Routine paused ⏸️",
      });
    } catch (error) {
      console.error("Error toggling routine:", error);
      toast({ title: "Failed to update routine", variant: "destructive" });
    }
  };

  const deleteRoutine = async (id: string) => {
    try {
      const { error } = await supabase
        .from("routines" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Routine deleted" });
      await fetchRoutines();
    } catch (error) {
      console.error("Error deleting routine:", error);
      toast({ title: "Failed to delete routine", variant: "destructive" });
    }
  };

  const startRoutine = async (routineId: string) => {
    if (!user) return null;
    const routine = routines.find((r) => r.id === routineId);
    try {
      const { data, error } = await supabase
        .from("routine_logs" as any)
        .insert({
          routine_id: routineId,
          user_id: user.id,
          status: "in_progress",
          current_step_index: 0,
          execution_date: new Date().toISOString().split("T")[0],
          mode: routine?.mode || "flexible",
          auto_adjust: routine?.auto_adjust ?? true,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data as any as RoutineLog;
    } catch (error) {
      console.error("Error starting routine:", error);
      return null;
    }
  };

  const getCompletedStepIds = async (logId: string): Promise<Set<string>> => {
    try {
      const { data } = await supabase
        .from("routine_step_logs" as any)
        .select("step_id")
        .eq("routine_log_id", logId);
      return new Set((data as any[] || []).map((d: any) => d.step_id));
    } catch {
      return new Set();
    }
  };

  const completeStep = async (
    logId: string,
    stepId: string,
    action: "completed" | "skipped",
    nextIndex: number,
    isLast: boolean,
    scheduledAt?: string
  ) => {
    try {
      const now = new Date().toISOString();
      let delaySec = 0;
      if (scheduledAt) {
        delaySec = Math.max(
          0,
          Math.floor((Date.now() - new Date(scheduledAt).getTime()) / 1000)
        );
      }

      await supabase.from("routine_step_logs" as any).insert({
        routine_log_id: logId,
        step_id: stepId,
        action,
        scheduled_at: scheduledAt || null,
        activated_at: now,
        delay_seconds: delaySec,
      } as any);

      const updates: any = { current_step_index: nextIndex };
      if (isLast) {
        updates.status = "completed";
        updates.completed_at = now;

        const { data: stepLogs } = await supabase
          .from("routine_step_logs" as any)
          .select("action, delay_seconds")
          .eq("routine_log_id", logId);

        if (stepLogs) {
          updates.discipline_score = calculateDisciplineScore(stepLogs as any[]);
        }
      }

      await supabase
        .from("routine_logs" as any)
        .update(updates)
        .eq("id", logId);

      if (isLast) {
        await updateStreak(logId);
      }

      return true;
    } catch (error) {
      console.error("Error completing step:", error);
      return false;
    }
  };

  const updateStreak = async (logId: string) => {
    if (!user) return;
    try {
      const { data: log } = await supabase
        .from("routine_logs" as any)
        .select("routine_id, discipline_score")
        .eq("id", logId)
        .single();
      if (!log) return;

      const routineId = (log as any).routine_id;
      const today = new Date().toISOString().split("T")[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

      const { data: existing } = await supabase
        .from("routine_streaks" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("routine_id", routineId)
        .single();

      if (existing) {
        const streak = existing as any;
        const wasYesterday = streak.last_completed_date === yesterday;
        const isToday = streak.last_completed_date === today;
        const newStreak = isToday
          ? streak.current_streak
          : wasYesterday
          ? streak.current_streak + 1
          : 1;

        await supabase
          .from("routine_streaks" as any)
          .update({
            current_streak: newStreak,
            best_streak: Math.max(newStreak, streak.best_streak),
            last_completed_date: today,
            total_completions: streak.total_completions + (isToday ? 0 : 1),
            avg_discipline_score: Math.round(
              ((streak.avg_discipline_score * streak.total_completions +
                (log as any).discipline_score) /
                (streak.total_completions + 1)) *
                100
            ) / 100,
          } as any)
          .eq("id", streak.id);
      } else {
        await supabase.from("routine_streaks" as any).insert({
          user_id: user.id,
          routine_id: routineId,
          current_streak: 1,
          best_streak: 1,
          last_completed_date: today,
          total_completions: 1,
          avg_discipline_score: (log as any).discipline_score || 100,
        } as any);
      }
    } catch (error) {
      console.error("Error updating streak:", error);
    }
  };

  const getTodayLog = async (routineId: string): Promise<RoutineLog | null> => {
    if (!user) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const { data, error } = await supabase
        .from("routine_logs" as any)
        .select("*")
        .eq("routine_id", routineId)
        .eq("user_id", user.id)
        .gte("started_at", today.toISOString())
        .order("started_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      return (data as any[])?.[0] || null;
    } catch {
      return null;
    }
  };

  const getStreak = async (routineId: string): Promise<RoutineStreak | null> => {
    if (!user) return null;
    try {
      const { data } = await supabase
        .from("routine_streaks" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("routine_id", routineId)
        .single();
      return (data as any) || null;
    } catch {
      return null;
    }
  };

  return {
    routines,
    loading,
    fetchRoutines,
    createRoutine,
    deleteRoutine,
    toggleRoutineActive,
    startRoutine,
    completeStep,
    getTodayLog,
    getStreak,
    getCompletedStepIds,
  };
}
