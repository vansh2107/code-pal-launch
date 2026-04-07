import { memo } from "react";
import { ChevronRight, Play, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { Routine } from "@/hooks/useRoutines";

interface RoutineCardProps {
  routine: Routine;
  todayProgress?: { completed: number; total: number; status: string };
  onStart: (id: string) => void;
  onContinue: (id: string) => void;
  onClick: (id: string) => void;
}

export const RoutineCard = memo(function RoutineCard({
  routine,
  todayProgress,
  onStart,
  onContinue,
  onClick,
}: RoutineCardProps) {
  const stepCount = routine.steps?.length || 0;
  const totalMinutes = routine.steps?.reduce((sum, s) => sum + s.duration_minutes, 0) || 0;
  const progress = todayProgress
    ? Math.round((todayProgress.completed / todayProgress.total) * 100)
    : 0;
  const isCompleted = todayProgress?.status === "completed";
  const isInProgress = todayProgress?.status === "in_progress";

  return (
    <div
      className="bg-card rounded-2xl p-4 border border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onClick(routine.id)}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-primary-soft flex items-center justify-center text-2xl shrink-0">
          {routine.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground truncate">{routine.name}</h3>
            {isCompleted ? (
              <CheckCircle2 className="h-5 w-5 text-valid shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
          </div>

          <p className="text-sm text-muted-foreground mt-0.5">
            {stepCount} steps • {totalMinutes} min
          </p>

          {/* Progress */}
          {todayProgress && (
            <div className="mt-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {isCompleted
                  ? "Completed today ✅"
                  : `${todayProgress.completed}/${todayProgress.total} steps done`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action button */}
      {!isCompleted && stepCount > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            isInProgress ? onContinue(routine.id) : onStart(routine.id);
          }}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary-dark transition-colors"
        >
          <Play className="h-4 w-4" />
          {isInProgress ? "Continue" : "Start"}
        </button>
      )}
    </div>
  );
});
