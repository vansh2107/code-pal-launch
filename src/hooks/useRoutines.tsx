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
  created_at: string;
  steps?: RoutineStep[];
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
    else if (log.delay_seconds > 900) score -= 10; // >15min
    else if (log.delay_seconds > 300) score -= 5;  // >5min
  }
  return Math.max(0, Math.min(100, score));
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

      if (routineIds.length > 0) {
        const { data: steps, error: stepsError } = await supabase
          .from("routine_steps" as any)
          .select("*")
          .in("routine_id", routineIds)
          .order("sort_order", { ascending: true });

        if (!stepsError && steps) {
          for (const step of steps as any[]) {
            if (!stepsMap[step.routine_id]) stepsMap[step.routine_id] = [];
            stepsMap[step.routine_id].push(step as RoutineStep);
          }
        }
      }

      const routinesWithSteps = (data as any[])?.map((r: any) => ({
        ...r,
        steps: stepsMap[r.id] || [],
      })) as Routine[];

      setRoutines(routinesWithSteps || []);
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
    steps: { title: string; duration_minutes: number }[],
    options?: { mode?: string; auto_adjust?: boolean; start_time?: string }
  ) => {
    if (!user) return null;
    try {
      const insertData: any = {
        user_id: user.id,
        name,
        category,
        icon,
        mode: options?.mode || "flexible",
        auto_adjust: options?.auto_adjust ?? true,
      };
      if (options?.start_time) insertData.start_time = options.start_time;

      const { data: routine, error } = await supabase
        .from("routines" as any)
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      if (steps.length > 0) {
        let offsetAccum = 0;
        const stepsData = steps.map((s, i) => {
          const stepData = {
            routine_id: (routine as any).id,
            title: s.title,
            duration_minutes: s.duration_minutes,
            sort_order: i,
            start_offset_minutes: offsetAccum,
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
      return (routine as any).id;
    } catch (error) {
      console.error("Error creating routine:", error);
      toast({ title: "Failed to create routine", variant: "destructive" });
      return null;
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

        // Calculate discipline score
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

      // Update streak if completed
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
    startRoutine,
    completeStep,
    getTodayLog,
    getStreak,
  };
}
