import { memo, useState } from "react";
import { ChevronRight, Play, CheckCircle2, Trash2, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Routine } from "@/hooks/useRoutines";

interface RoutineCardProps {
  routine: Routine;
  todayProgress?: { completed: number; total: number; status: string };
  onStart: (id: string) => void;
  onContinue: (id: string) => void;
  onClick: (id: string) => void;
  onDelete?: (id: string) => void;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export const RoutineCard = memo(function RoutineCard({
  routine,
  todayProgress,
  onStart,
  onContinue,
  onClick,
  onDelete,
}: RoutineCardProps) {
  const [showDelete, setShowDelete] = useState(false);
  const stepCount = routine.steps?.length || 0;

  // Show time range from steps
  const stepsWithTime = (routine.steps || []).filter((s) => s.step_start_time);
  const firstTime = stepsWithTime[0]?.step_start_time;
  const lastTime = stepsWithTime[stepsWithTime.length - 1]?.step_start_time;

  const progress = todayProgress
    ? Math.round((todayProgress.completed / todayProgress.total) * 100)
    : 0;
  const isCompleted = todayProgress?.status === "completed";
  const isInProgress = todayProgress?.status === "in_progress";

  return (
    <>
      <div
        className="bg-card rounded-2xl p-4 border border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => onClick(routine.id)}
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/5 flex items-center justify-center text-2xl shrink-0">
            {routine.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground truncate">{routine.name}</h3>
              <div className="flex items-center gap-1 shrink-0">
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDelete(true);
                    }}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-muted-foreground">{stepCount} steps</span>
              {firstTime && lastTime && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatTime12(firstTime)} – {formatTime12(lastTime)}
                </span>
              )}
            </div>

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

        {!isCompleted && stepCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              isInProgress ? onContinue(routine.id) : onStart(routine.id);
            }}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
          >
            <Play className="h-4 w-4" />
            {isInProgress ? "Continue" : "Start"}
          </button>
        )}
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Routine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{routine.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete?.(routine.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
