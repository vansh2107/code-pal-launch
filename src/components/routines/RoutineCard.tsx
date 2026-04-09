import { memo, useState } from "react";
import { Trash2, Clock, ChevronDown, ChevronUp, Pencil, Power } from "lucide-react";
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
import { type Routine, type RoutineTask, formatTime12, formatDaysShort } from "@/hooks/useRoutines";

interface RoutineCardProps {
  routine: Routine;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onAddTask: (routineId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (task: RoutineTask) => void;
}

function TaskSlotDisplay({ task }: { task: RoutineTask }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">{task.name}</p>
      {task.slots.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No time slots set</p>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {task.slots.map((slot) => (
            <span key={slot.id} className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDaysShort(slot.days_of_week)} → {formatTime12(slot.time)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const RoutineCard = memo(function RoutineCard({
  routine,
  onDelete,
  onToggleActive,
  onAddTask,
  onDeleteTask,
  onEditTask,
}: RoutineCardProps) {
  const [showDelete, setShowDelete] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const isActive = routine.is_active !== false;

  return (
    <>
      <div
        className={`bg-card rounded-2xl border border-border/60 shadow-sm transition-all ${
          !isActive ? "opacity-50" : ""
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 pb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-xl shrink-0">
            {routine.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{routine.name}</h3>
            <p className="text-xs text-muted-foreground">
              {routine.tasks.length} task{routine.tasks.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Power icon as active toggle */}
            <button
              onClick={() => onToggleActive(routine.id, !isActive)}
              className={`p-2 rounded-xl transition-all ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
              title={isActive ? "Pause routine" : "Activate routine"}
            >
              <Power className="h-4.5 w-4.5" strokeWidth={isActive ? 2.5 : 2} />
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        {/* Task List */}
        {expanded && (
          <div className="px-4 pb-3 space-y-2">
            {routine.tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-2 bg-muted/40 rounded-xl p-2.5 border border-border/30"
              >
                <div className="flex-1 min-w-0">
                  <TaskSlotDisplay task={task} />
                </div>
                <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                  <button
                    onClick={() => onEditTask(task)}
                    className="p-1 rounded-md hover:bg-primary/10 transition-colors"
                    title="Edit task"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                  </button>
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    className="p-1 rounded-md hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={() => onAddTask(routine.id)}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-border/60 text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
            >
              ➕ Add Task
            </button>
          </div>
        )}

        {!isActive && (
          <div className="px-4 pb-3 text-center text-xs text-muted-foreground">
            ⏸️ Paused — tap <Power className="h-3 w-3 inline" /> to resume
          </div>
        )}
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Routine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{routine.name}"? All tasks and slots will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete(routine.id)}
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
