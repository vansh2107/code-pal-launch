import { useState, useEffect } from "react";
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
import { Plus, Trash2, Clock } from "lucide-react";
import type { RoutineTask } from "@/hooks/useRoutines";

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
  id?: string;
  time: string;
  days_of_week: number[];
}

interface EditRoutineTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (taskId: string, name: string, slots: SlotInput[]) => void;
  task: RoutineTask | null;
}

export function EditRoutineTaskSheet({
  open,
  onOpenChange,
  onSubmit,
  task,
}: EditRoutineTaskSheetProps) {
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<SlotInput[]>([]);

  useEffect(() => {
    if (task && open) {
      setName(task.name);
      setSlots(
        task.slots.length > 0
          ? task.slots.map((s) => ({
              id: s.id,
              time: s.time.slice(0, 5), // "HH:mm:ss" → "HH:mm"
              days_of_week: [...s.days_of_week],
            }))
          : [{ time: "07:00", days_of_week: [1, 2, 3, 4, 5, 6, 7] }]
      );
    }
  }, [task, open]);

  const addSlot = () => {
    setSlots((s) => [...s, { time: "18:00", days_of_week: [] }]);
  };

  const removeSlot = (i: number) => setSlots((s) => s.filter((_, idx) => idx !== i));

  const updateSlotTime = (i: number, time: string) =>
    setSlots((s) => s.map((slot, idx) => (idx === i ? { ...slot, time } : slot)));

  const toggleSlotDay = (slotIdx: number, day: number) => {
    setSlots((prev) =>
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

  const validSlots = slots.filter((s) => s.days_of_week.length > 0 && s.time);
  const canSubmit = name.trim().length > 0 && validSlots.length > 0;

  const handleSubmit = () => {
    if (!canSubmit || !task) return;
    onSubmit(task.id, name.trim(), validSlots);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[75vh] rounded-t-3xl px-4 pb-8">
        <SheetHeader className="mb-3">
          <SheetTitle>Edit Task</SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto max-h-[calc(75vh-140px)] space-y-5 pr-1 pb-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Task Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Workout, Meditation"
              className="h-11 text-base rounded-xl"
              autoFocus
            />
          </div>

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

            {slots.map((slot, si) => (
              <div
                key={si}
                className="bg-muted/50 rounded-2xl p-3 border border-border/50 space-y-2"
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
                  {slots.length > 1 && (
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
        </div>

        <div className="pt-3">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-12 rounded-xl text-base"
          >
            Save Changes ✅
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
