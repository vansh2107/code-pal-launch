import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoutineCard } from "./RoutineCard";
import { CreateRoutineSheet } from "./CreateRoutineSheet";
import { useRoutines } from "@/hooks/useRoutines";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TodayProgress {
  completed: number;
  total: number;
  status: string;
}

export function RoutinesSection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { routines, loading, createRoutine, deleteRoutine } = useRoutines();
  const [showCreate, setShowCreate] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, TodayProgress>>({});

  // Fetch today's progress for all routines
  const fetchProgress = useCallback(async () => {
    if (!user || routines.length === 0) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const { data: logs } = await supabase
        .from("routine_logs" as any)
        .select("*")
        .eq("user_id", user.id)
        .gte("started_at", today.toISOString());

      if (!logs) return;

      const map: Record<string, TodayProgress> = {};
      for (const log of logs as any[]) {
        const routine = routines.find((r) => r.id === log.routine_id);
        if (!routine) continue;

        // Get completed step logs for this log
        const { data: stepLogs } = await supabase
          .from("routine_step_logs" as any)
          .select("id")
          .eq("routine_log_id", log.id);

        map[log.routine_id] = {
          completed: stepLogs?.length || 0,
          total: routine.steps?.length || 0,
          status: log.status,
        };
      }
      setProgressMap(map);
    } catch (error) {
      console.error("Error fetching routine progress:", error);
    }
  }, [user, routines]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const handleCreate = async (
    name: string,
    category: string,
    icon: string,
    steps: { title: string; duration_minutes: number; step_start_time: string }[],
    options?: { mode?: string; auto_adjust?: boolean; start_time?: string; repeat_days?: number[]; notifications_enabled?: boolean; start_date?: string }
  ) => {
    await createRoutine(name, category, icon, steps, options);
    setShowCreate(false);
  };

  const handleStart = async (routineId: string) => {
    navigate(`/routine/${routineId}`);
  };

  const handleContinue = (routineId: string) => {
    navigate(`/routine/${routineId}`);
  };

  const handleClick = (routineId: string) => {
    navigate(`/routine/${routineId}`);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-32 bg-muted/50 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Routines</h2>
          <p className="text-sm text-muted-foreground">
            Your guided daily flows
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowCreate(true)}
          className="rounded-full"
        >
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>

      {/* Routine cards */}
      {routines.length === 0 ? (
        <div className="text-center py-12 space-y-4">
          <div className="text-5xl">🧘</div>
          <h3 className="font-semibold text-foreground">No routines yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Create your first routine to get guided through your day,
            one step at a time.
          </p>
          <Button onClick={() => setShowCreate(true)} className="rounded-full px-6">
            <Plus className="h-4 w-4 mr-2" />
            Create First Routine
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {routines.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              todayProgress={progressMap[routine.id]}
              onStart={handleStart}
              onContinue={handleContinue}
              onClick={handleClick}
              onDelete={deleteRoutine}
            />
          ))}
        </div>
      )}

      <CreateRoutineSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={handleCreate}
      />
    </div>
  );
}
