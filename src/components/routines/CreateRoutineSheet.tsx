import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Clock, ChevronDown, ChevronUp } from "lucide-react";

const ROUTINE_PRESETS = [
  { icon: "☀️", name: "Morning Routine" },
  { icon: "🌙", name: "Night Routine" },
  { icon: "💪", name: "Workout" },
  { icon: "📚", name: "Study" },
  { icon: "🧘", name: "Meditation" },
  { icon: "🏃", name: "Exercise" },
  { icon: "🎯", name: "Focus Time" },
  { icon: "⚡", name: "Productivity" },
  { icon: "🍳", name: "Cooking" },
  { icon: "🧹", name: "Cleaning" },
  { icon: "💊", name: "Health" },
  { icon: "🎨", name: "Creative" },
];

const DAYS_OF_WEEK = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 7, label: "S" },
];

interface SlotInput {
  time: string;
  days_of_week: number[];
}

interface InlineTask {
  name: string;
  slots: SlotInput[];
}

interface CreateRoutineSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, icon: string, tasks: InlineTask[]) => void;
}

export function CreateRoutineSheet({
  open,
  onOpenChange,
  onSubmit,
}: CreateRoutineSheetProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [tasks, setTasks] = useState<InlineTask[]>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskSlots, setNewTaskSlots] = useState<SlotInput[]>([
    { time: "07:00", days_of_week: [1, 2, 3, 4, 5, 6, 7] },
  ]);

  const canSubmit = name.trim().length > 0;

  const handlePresetClick = (preset: typeof ROUTINE_PRESETS[0]) => {
    setName(preset.name);
    setIcon(preset.icon);
  };

  const resetAll = () => {
    setName("");
    setIcon("");
    setTasks([]);
    setShowAddTask(false);
    setNewTaskName("");
    setNewTaskSlots([{ time: "07:00", days_of_week: [1, 2, 3, 4, 5, 6, 7] }]);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(name.trim(), icon || "⚡", tasks);
    resetAll();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetAll();
    onOpenChange(open);
  };

  // Inline task slot helpers
  const addSlot = () => {
    setNewTaskSlots((s) => [...s, { time: "18:00", days_of_week: [] }]);
  };
  const removeSlot = (i: number) => setNewTaskSlots((s) => s.filter((_, idx) => idx !== i));
  const updateSlotTime = (i: number, time: string) =>
    setNewTaskSlots((s) => s.map((slot, idx) => (idx === i ? { ...slot, time } : slot)));
  const toggleSlotDay = (slotIdx: number, day: number) => {
    setNewTaskSlots((prev) =>
      prev.map((slot, idx) => {
        if (idx !== slotIdx) return slot;
        const has = slot.days_of_week.includes(day);
        return {
          ...slot,
          days_of_week: has
            ? slot.days_of_week.filter((d) => d !== day)
            : [...slot.days_of_week, day].sort(),
        };
      })
    );
  };

  const validNewSlots = newTaskSlots.filter((s) => s.days_of_week.length > 0 && s.time);
  const canAddTask = newTaskName.trim().length > 0 && validNewSlots.length > 0;

  const handleAddTask = () => {
    if (!canAddTask) return;
    setTasks((prev) => [...prev, { name: newTaskName.trim(), slots: validNewSlots }]);
    setNewTaskName("");
    setNewTaskSlots([{ time: "07:00", days_of_week: [1, 2, 3, 4, 5, 6, 7] }]);
    setShowAddTask(false);
  };

  const removeTask = (i: number) => setTasks((t) => t.filter((_, idx) => idx !== i));

  const formatTime12 = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl px-4 pb-8">
        <SheetHeader className="mb-4">
          <SheetTitle>Create Routine</SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto max-h-[calc(85vh-140px)] space-y-5 pr-1 pb-4">
          {/* Presets */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pick a routine
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {ROUTINE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetClick(preset)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all",
                    name === preset.name && icon === preset.icon
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  <span className="text-2xl">{preset.icon}</span>
                  <span className="text-[11px] font-medium text-foreground leading-tight text-center">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Routine name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Routine Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Or type a custom name..."
              className="h-11 text-base rounded-xl"
            />
          </div>

          {/* Added tasks list */}
          {tasks.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tasks ({tasks.length})
              </Label>
              <div className="space-y-2">
                {tasks.map((task, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-muted/50 rounded-xl p-3 border border-border/50"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{task.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.slots.map((s) => formatTime12(s.time)).join(", ")}
                      </p>
                    </div>
                    <button onClick={() => removeTask(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add task section */}
          <div className="space-y-2">
            <button
              onClick={() => setShowAddTask(!showAddTask)}
              className="flex items-center gap-2 text-sm font-semibold text-primary"
            >
              {showAddTask ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {showAddTask ? "Cancel adding task" : "Add a task"}
            </button>

            {showAddTask && (
              <div className="bg-muted/30 rounded-2xl p-4 border border-border/50 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Task Name
                  </Label>
                  <Input
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    placeholder="e.g. Workout, Meditation"
                    className="h-10 text-sm rounded-xl"
                    autoFocus
                  />
                </div>

                {/* Time slots */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Time Slots
                    </Label>
                    <button
                      onClick={addSlot}
                      className="text-xs text-primary font-semibold flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Add Slot
                    </button>
                  </div>

                  {newTaskSlots.map((slot, si) => (
                    <div
                      key={si}
                      className="bg-card rounded-xl p-3 border border-border/50 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Input
                            type="time"
                            value={slot.time}
                            onChange={(e) => updateSlotTime(si, e.target.value)}
                            className="w-[110px] h-9 text-sm rounded-lg"
                          />
                        </div>
                        {newTaskSlots.length > 1 && (
                          <button onClick={() => removeSlot(si)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {DAYS_OF_WEEK.map((day) => (
                          <button
                            key={`${si}-${day.value}`}
                            onClick={() => toggleSlotDay(si, day.value)}
                            className={cn(
                              "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                              slot.days_of_week.includes(day.value)
                                ? "bg-primary text-primary-foreground"
                                : "bg-card text-muted-foreground border border-border"
                            )}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={handleAddTask}
                  disabled={!canAddTask}
                  variant="secondary"
                  className="w-full h-10 rounded-xl text-sm"
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Task
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-3">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-12 rounded-xl text-base"
          >
            Create Routine 🎯
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
