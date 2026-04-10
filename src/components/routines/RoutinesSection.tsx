import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoutineCard } from "./RoutineCard";
import { CreateRoutineSheet } from "./CreateRoutineSheet";
import { AddRoutineTaskSheet } from "./AddRoutineTaskSheet";
import { EditRoutineTaskSheet } from "./EditRoutineTaskSheet";
import { useRoutines, type RoutineTask } from "@/hooks/useRoutines";

export function RoutinesSection() {
  const { routines, loading, createRoutine, deleteRoutine, toggleRoutineActive, addTask, deleteTask, updateTask } = useRoutines();
  const [showCreate, setShowCreate] = useState(false);
  const [addTaskTarget, setAddTaskTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingTask, setEditingTask] = useState<RoutineTask | null>(null);

  const handleCreate = async (name: string, icon: string, tasks: { name: string; slots: { time: string; days_of_week: number[] }[] }[]) => {
    const routineId = await createRoutine(name, icon);
    if (routineId && tasks.length > 0) {
      for (const task of tasks) {
        await addTask(routineId, task.name, task.slots);
      }
    }
    setShowCreate(false);
  };

  const handleAddTask = async (name: string, slots: { time: string; days_of_week: number[] }[]) => {
    if (!addTaskTarget) return;
    await addTask(addTaskTarget.id, name, slots);
    setAddTaskTarget(null);
  };

  const handleEditTask = async (taskId: string, name: string, slots: { time: string; days_of_week: number[] }[]) => {
    await updateTask(taskId, name, slots);
    setEditingTask(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 bg-muted/50 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Routines</h2>
          <p className="text-sm text-muted-foreground">Groups of scheduled tasks</p>
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

      {routines.length === 0 ? (
        <div className="text-center py-12 space-y-4">
          <div className="text-5xl">🧘</div>
          <h3 className="font-semibold text-foreground">No routines yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Create a routine to group your daily tasks with flexible schedules.
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
              onDelete={deleteRoutine}
              onToggleActive={toggleRoutineActive}
              onAddTask={(id) =>
                setAddTaskTarget({ id, name: routine.name })
              }
              onDeleteTask={deleteTask}
              onEditTask={setEditingTask}
            />
          ))}
        </div>
      )}

      <CreateRoutineSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        onSubmit={handleCreate}
      />

      <AddRoutineTaskSheet
        open={!!addTaskTarget}
        onOpenChange={(open) => !open && setAddTaskTarget(null)}
        onSubmit={handleAddTask}
        routineName={addTaskTarget?.name || ""}
      />

      <EditRoutineTaskSheet
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
        onSubmit={handleEditTask}
        task={editingTask}
      />
    </div>
  );
}
