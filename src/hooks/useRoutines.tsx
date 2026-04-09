import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface RoutineTaskSlot {
  id: string;
  task_id: string;
  time: string; // "HH:mm:ss"
  days_of_week: number[];
}

export interface RoutineTask {
  id: string;
  routine_id: string;
  name: string;
  created_at: string;
  slots: RoutineTaskSlot[];
}

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  is_active: boolean;
  created_at: string;
  tasks: RoutineTask[];
}

const DAYS_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatDaysShort(days: number[]): string {
  if (!days || days.length === 0) return "";
  if (days.length === 7) return "Daily";
  if (arraysEqual(days, [1, 2, 3, 4, 5])) return "Mon–Fri";
  if (arraysEqual(days, [6, 7])) return "Sat–Sun";
  return days.map((d) => DAYS_LABELS[d]).join(", ");
}

function arraysEqual(a: number[], b: number[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

export function useRoutines() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoutines = useCallback(async () => {
    if (!user) return;
    try {
      const { data: routineRows, error } = await supabase
        .from("routines" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!routineRows || routineRows.length === 0) {
        setRoutines([]);
        setLoading(false);
        return;
      }

      const routineIds = (routineRows as any[]).map((r) => r.id);

      // Fetch tasks and slots in parallel
      const { data: taskRows } = await supabase
        .from("routine_tasks" as any)
        .select("*")
        .in("routine_id", routineIds)
        .order("created_at", { ascending: true });

      const taskIds = (taskRows as any[] || []).map((t: any) => t.id);
      let slotRows: any[] = [];
      if (taskIds.length > 0) {
        const { data } = await supabase
          .from("routine_task_slots" as any)
          .select("*")
          .in("task_id", taskIds);
        slotRows = (data as any[]) || [];
      }

      // Build slot map by task_id
      const slotMap: Record<string, RoutineTaskSlot[]> = {};
      for (const s of slotRows) {
        if (!slotMap[s.task_id]) slotMap[s.task_id] = [];
        slotMap[s.task_id].push(s as RoutineTaskSlot);
      }

      // Build task map by routine_id
      const taskMap: Record<string, RoutineTask[]> = {};
      for (const t of (taskRows as any[] || [])) {
        if (!taskMap[t.routine_id]) taskMap[t.routine_id] = [];
        taskMap[t.routine_id].push({
          ...t,
          slots: slotMap[t.id] || [],
        } as RoutineTask);
      }

      const result: Routine[] = (routineRows as any[]).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        name: r.name,
        icon: r.icon || "☀️",
        is_active: r.is_active !== false,
        created_at: r.created_at,
        tasks: taskMap[r.id] || [],
      }));

      setRoutines(result);
    } catch (error) {
      console.error("Error fetching routines:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines]);

  const createRoutine = async (name: string, icon: string) => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from("routines" as any)
        .insert({ user_id: user.id, name, icon } as any)
        .select()
        .single();
      if (error) throw error;
      toast({ title: "Routine created! 🎯" });
      await fetchRoutines();
      return (data as any).id;
    } catch (error) {
      console.error("Error creating routine:", error);
      toast({ title: "Failed to create routine", variant: "destructive" });
      return null;
    }
  };

  const deleteRoutine = async (id: string) => {
    try {
      const { error } = await supabase.from("routines" as any).delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Routine deleted" });
      await fetchRoutines();
    } catch (error) {
      console.error("Error deleting routine:", error);
      toast({ title: "Failed to delete routine", variant: "destructive" });
    }
  };

  const toggleRoutineActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("routines" as any)
        .update({ is_active: isActive } as any)
        .eq("id", id);
      if (error) throw error;

      setRoutines((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_active: isActive } : r))
      );
      toast({ title: isActive ? "Routine activated ✅" : "Routine paused ⏸️" });
    } catch (error) {
      console.error("Error toggling routine:", error);
      toast({ title: "Failed to update routine", variant: "destructive" });
    }
  };

  const addTask = async (
    routineId: string,
    name: string,
    slots: { time: string; days_of_week: number[] }[]
  ) => {
    if (!user) return null;
    try {
      const { data: task, error } = await supabase
        .from("routine_tasks" as any)
        .insert({ routine_id: routineId, name } as any)
        .select()
        .single();
      if (error) throw error;

      const taskId = (task as any).id;
      if (slots.length > 0) {
        const slotData = slots.map((s) => ({
          task_id: taskId,
          time: s.time,
          days_of_week: s.days_of_week,
        }));
        const { error: slotError } = await supabase
          .from("routine_task_slots" as any)
          .insert(slotData as any);
        if (slotError) throw slotError;
      }

      toast({ title: "Task added! ✅" });
      await fetchRoutines();
      return taskId;
    } catch (error) {
      console.error("Error adding task:", error);
      toast({ title: "Failed to add task", variant: "destructive" });
      return null;
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("routine_tasks" as any)
        .delete()
        .eq("id", taskId);
      if (error) throw error;
      toast({ title: "Task removed" });
      await fetchRoutines();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast({ title: "Failed to delete task", variant: "destructive" });
    }
  };

  const updateTask = async (
    taskId: string,
    name: string,
    slots: { id?: string; time: string; days_of_week: number[] }[]
  ) => {
    try {
      // Update task name
      const { error: nameError } = await supabase
        .from("routine_tasks" as any)
        .update({ name } as any)
        .eq("id", taskId);
      if (nameError) throw nameError;

      // Delete old slots and insert new ones
      const { error: delError } = await supabase
        .from("routine_task_slots" as any)
        .delete()
        .eq("task_id", taskId);
      if (delError) throw delError;

      if (slots.length > 0) {
        const slotData = slots.map((s) => ({
          task_id: taskId,
          time: s.time,
          days_of_week: s.days_of_week,
        }));
        const { error: slotError } = await supabase
          .from("routine_task_slots" as any)
          .insert(slotData as any);
        if (slotError) throw slotError;
      }

      toast({ title: "Task updated! ✅" });
      await fetchRoutines();
    } catch (error) {
      console.error("Error updating task:", error);
      toast({ title: "Failed to update task", variant: "destructive" });
    }
  };

  return {
    routines,
    loading,
    createRoutine,
    deleteRoutine,
    toggleRoutineActive,
    addTask,
    deleteTask,
    updateTask,
    refetch: fetchRoutines,
  };
}
