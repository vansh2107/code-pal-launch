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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Plus, Trash2, GripVertical, Bell, Clock } from "lucide-react";

const CATEGORIES = [
  { value: "morning", label: "Morning", icon: "🌅" },
  { value: "gym", label: "Gym", icon: "💪" },
  { value: "evening", label: "Evening", icon: "🌙" },
  { value: "custom", label: "Custom", icon: "⚡" },
];

const MODES = [
  { value: "flexible", label: "Flexible", desc: "Soft reminders", icon: "🌊" },
  { value: "strict", label: "Strict", desc: "Strong nudges", icon: "⚡" },
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
  days_of_week: number[];
  start_time: string;
}

interface Step {
  title: string;
  duration_minutes: number;
  step_start_time: string;
}

interface CreateRoutineSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    name: string,
    category: string,
    icon: string,
    steps: Step[],
    options?: {
      mode?: string;
      auto_adjust?: boolean;
      repeat_days?: number[];
      notifications_enabled?: boolean;
      slots?: { days_of_week: number[]; start_time: string }[];
    }
  ) => void;
}

export function CreateRoutineSheet({
  open,
  onOpenChange,
  onSubmit,
}: CreateRoutineSheetProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("custom");
  const [mode, setMode] = useState("flexible");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [slots, setSlots] = useState<SlotInput[]>([
    { days_of_week: [1, 2, 3, 4, 5, 6, 7], start_time: "07:00" },
  ]);
  const [steps, setSteps] = useState<Step[]>([
    { title: "", duration_minutes: 5, step_start_time: "07:00" },
  ]);

  const selectedIcon = CATEGORIES.find((c) => c.value === category)?.icon || "⚡";

  // --- Slot management ---
  const addSlot = () => {
    setSlots((s) => [...s, { days_of_week: [], start_time: "18:00" }]);
  };
  const removeSlot = (i: number) => setSlots((s) => s.filter((_, idx) => idx !== i));
  const updateSlotTime = (i: number, time: string) =>
    setSlots((s) => s.map((slot, idx) => (idx === i ? { ...slot, start_time: time } : slot)));
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

  // Check for overlapping days across slots
  const hasDayOverlap = () => {
    const seenDays = new Set<number>();
    for (const slot of slots) {
      for (const d of slot.days_of_week) {
        if (seenDays.has(d)) return true;
        seenDays.add(d);
      }
    }
    return false;
  };

  // --- Step management ---
  const addStep = () => {
    const lastStep = steps[steps.length - 1];
    let nextTime = "07:00";
    if (lastStep?.step_start_time) {
      const [h, m] = lastStep.step_start_time.split(":").map(Number);
      const totalMin = h * 60 + m + (lastStep.duration_minutes || 5);
      const nh = Math.floor(totalMin / 60) % 24;
      const nm = totalMin % 60;
      nextTime = `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
    }
    setSteps((s) => [...s, { title: "", duration_minutes: 5, step_start_time: nextTime }]);
  };
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));
  const updateStep = (i: number, field: keyof Step, value: string | number) =>
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, [field]: value } : step)));

  const allDays = [...new Set(slots.flatMap((s) => s.days_of_week))];
  const validSlots = slots.filter((s) => s.days_of_week.length > 0 && s.start_time);
  const validSteps = steps.filter((s) => s.title.trim() && s.step_start_time);

  const canSubmit =
    name.trim().length > 0 &&
    validSlots.length > 0 &&
    allDays.length > 0 &&
    validSteps.length > 0 &&
    !hasDayOverlap();

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(name.trim(), category, selectedIcon, validSteps, {
      mode,
      auto_adjust: true,
      repeat_days: allDays.sort(),
      notifications_enabled: notificationsEnabled,
      slots: validSlots,
    });
    // Reset
    setName("");
    setCategory("custom");
    setMode("flexible");
    setNotificationsEnabled(true);
    setSlots([{ days_of_week: [1, 2, 3, 4, 5, 6, 7], start_time: "07:00" }]);
    setSteps([{ title: "", duration_minutes: 5, step_start_time: "07:00" }]);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl px-4 pb-8">
        <SheetHeader className="mb-3">
          <SheetTitle>Create Routine</SheetTitle>
        </SheetHeader>

        <div className="overflow-y-auto max-h-[calc(92vh-140px)] space-y-5 pr-1 pb-4">
          {/* ─── Name ─── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning Routine"
              className="h-11 text-base rounded-xl"
            />
          </div>

          {/* ─── Category ─── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</Label>
            <div className="flex gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all text-xs font-medium",
                    category === c.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground"
                  )}
                >
                  <span className="text-lg">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Time Slots ─── */}
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

            {hasDayOverlap() && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                ⚠️ A day can only belong to one slot. Remove duplicates.
              </p>
            )}

            {slots.map((slot, si) => (
              <div key={si} className="bg-muted/50 rounded-2xl p-3 border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="time"
                      value={slot.start_time}
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
                  {DAYS_OF_WEEK.map((day) => {
                    const usedElsewhere = slots.some(
                      (s, idx) => idx !== si && s.days_of_week.includes(day.value)
                    );
                    return (
                      <button
                        key={`${si}-${day.value}`}
                        onClick={() => !usedElsewhere && toggleSlotDay(si, day.value)}
                        disabled={usedElsewhere}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                          slot.days_of_week.includes(day.value)
                            ? "bg-primary text-primary-foreground"
                            : usedElsewhere
                            ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
                            : "bg-card text-muted-foreground border border-border"
                        )}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ─── Steps (Timeline) ─── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Steps
              </Label>
              <button
                onClick={addStep}
                className="text-xs text-primary font-semibold flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Step
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Set a clock time for each step. Notifications fire at these times.
            </p>

            {steps.map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-muted/50 rounded-xl p-2.5 border border-border/50"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  type="time"
                  value={step.step_start_time}
                  onChange={(e) => updateStep(i, "step_start_time", e.target.value)}
                  className="w-[100px] h-9 text-sm rounded-lg shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <Input
                    value={step.title}
                    onChange={(e) => updateStep(i, "title", e.target.value)}
                    placeholder={`Step ${i + 1}`}
                    className="h-9 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    value={step.duration_minutes}
                    onChange={(e) => updateStep(i, "duration_minutes", Number(e.target.value) || 1)}
                    className="w-12 h-9 text-center text-xs rounded-lg"
                    min={1}
                  />
                  <span className="text-[10px] text-muted-foreground">m</span>
                </div>
                {steps.length > 1 && (
                  <button onClick={() => removeStep(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* ─── Mode ─── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl border-2 transition-all",
                    mode === m.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card"
                  )}
                >
                  <span className="text-lg">{m.icon}</span>
                  <div className="text-left">
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ─── Notifications ─── */}
          <div className="flex items-center justify-between bg-muted/50 rounded-xl p-3 border border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Notifications</p>
                <p className="text-[11px] text-muted-foreground">Step reminders</p>
              </div>
            </div>
            <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
          </div>
        </div>

        {/* ─── Submit ─── */}
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
