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
}

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  category: string;
  icon: string;
  is_active: boolean;
  repeat_days: number[];
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
}

export interface RoutineStepLog {
  id: string;
  routine_log_id: string;
  step_id: string;
  action: string;
  completed_at: string;
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

      // Fetch steps for each routine
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
    steps: { title: string; duration_minutes: number }[]
  ) => {
    if (!user) return null;
    try {
      const { data: routine, error } = await supabase
        .from("routines" as any)
        .insert({ user_id: user.id, name, category, icon } as any)
        .select()
        .single();

      if (error) throw error;

      if (steps.length > 0) {
        const stepsData = steps.map((s, i) => ({
          routine_id: (routine as any).id,
          title: s.title,
          duration_minutes: s.duration_minutes,
          sort_order: i,
        }));

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
    try {
      const { data, error } = await supabase
        .from("routine_logs" as any)
        .insert({
          routine_id: routineId,
          user_id: user.id,
          status: "in_progress",
          current_step_index: 0,
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
    isLast: boolean
  ) => {
    try {
      // Log step completion
      await supabase
        .from("routine_step_logs" as any)
        .insert({ routine_log_id: logId, step_id: stepId, action } as any);

      // Update routine log
      const updates: any = { current_step_index: nextIndex };
      if (isLast) {
        updates.status = "completed";
        updates.completed_at = new Date().toISOString();
      }

      await supabase
        .from("routine_logs" as any)
        .update(updates)
        .eq("id", logId);

      return true;
    } catch (error) {
      console.error("Error completing step:", error);
      return false;
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

  return {
    routines,
    loading,
    fetchRoutines,
    createRoutine,
    deleteRoutine,
    startRoutine,
    completeStep,
    getTodayLog,
  };
}
