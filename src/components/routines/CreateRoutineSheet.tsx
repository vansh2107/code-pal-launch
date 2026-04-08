import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Plus, Trash2, GripVertical, ArrowRight, ArrowLeft, Bell } from "lucide-react";

const CATEGORIES = [
  { value: "morning", label: "Morning", icon: "☀️" },
  { value: "gym", label: "Gym", icon: "💪" },
  { value: "medicine", label: "Medicine", icon: "💊" },
  { value: "work", label: "Work", icon: "💼" },
  { value: "evening", label: "Evening", icon: "🌙" },
  { value: "custom", label: "Custom", icon: "⚡" },
];

const MODES = [
  { value: "flexible", label: "Flexible", desc: "Soft reminders, delay tolerance", icon: "🌊" },
  { value: "strict", label: "Strict", desc: "Persistent reminders, strong nudges", icon: "⚡" },
];

const DAYS_OF_WEEK = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

interface Step {
  title: string;
  duration_minutes: number;
  step_start_time: string;
}

export interface RoutineCreateOptions {
  mode?: string;
  auto_adjust?: boolean;
  start_time?: string;
  repeat_days?: number[];
  notifications_enabled?: boolean;
  start_date?: string; // YYYY-MM-DD
}

interface CreateRoutineSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    name: string,
    category: string,
    icon: string,
    steps: Step[],
    options?: RoutineCreateOptions
  ) => void;
}

export function CreateRoutineSheet({
  open,
  onOpenChange,
  onSubmit,
}: CreateRoutineSheetProps) {
  const [page, setPage] = useState(0);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("morning");
  const [icon, setIcon] = useState("☀️");
  const [mode, setMode] = useState("flexible");
  const [autoAdjust, setAutoAdjust] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [repeatDays, setRepeatDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [steps, setSteps] = useState<Step[]>([
    { title: "", duration_minutes: 5, step_start_time: "07:00" },
  ]);

  const toggleDay = (day: number) => {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

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

  const removeStep = (i: number) =>
    setSteps((s) => s.filter((_, idx) => idx !== i));

  const updateStep = (i: number, field: keyof Step, value: string | number) =>
    setSteps((s) =>
      s.map((step, idx) => (idx === i ? { ...step, [field]: value } : step))
    );

  const handleSubmit = () => {
    const validSteps = steps.filter((s) => s.title.trim() && s.step_start_time);
    if (!name.trim() || validSteps.length === 0 || repeatDays.length === 0) return;
    onSubmit(name.trim(), category, icon, validSteps, {
      mode,
      auto_adjust: autoAdjust,
      repeat_days: repeatDays,
      notifications_enabled: notificationsEnabled,
      start_date: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
    });
    // Reset
    setPage(0);
    setName("");
    setCategory("morning");
    setIcon("☀️");
    setMode("flexible");
    setAutoAdjust(true);
    setNotificationsEnabled(true);
    setRepeatDays([1, 2, 3, 4, 5, 6, 7]);
    setStartDate(new Date());
    setSteps([{ title: "", duration_minutes: 5, step_start_time: "07:00" }]);
  };

  const canProceed =
    page === 0
      ? name.trim().length > 0 && repeatDays.length > 0
      : steps.some((s) => s.title.trim() && s.step_start_time);

  const hasOverlap = () => {
    const times = steps
      .filter((s) => s.step_start_time && s.title.trim())
      .map((s) => s.step_start_time)
      .sort();
    return new Set(times).size !== times.length;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl px-4 pb-8">
        <SheetHeader className="mb-4">
          <SheetTitle>
            {page === 0 ? "Create Routine" : "Add Steps & Times"}
          </SheetTitle>
        </SheetHeader>

        {/* Step indicator */}
        <div className="flex gap-2 mb-6">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= page ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {page === 0 ? (
          <div className="space-y-5 animate-fade-in overflow-y-auto max-h-[60vh] pr-1">
            {/* Name */}
            <div className="space-y-2">
              <Label>Routine Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Routine"
                className="h-12 text-base rounded-xl"
              />
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-12 justify-start text-left font-normal rounded-xl",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Repeat Days */}
            <div className="space-y-2">
              <Label>Repeat Days</Label>
              <div className="flex gap-1.5">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.value}
                    onClick={() => toggleDay(day.value)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all",
                      repeatDays.includes(day.value)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              {repeatDays.length === 0 && (
                <p className="text-xs text-destructive">Select at least one day</p>
              )}
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category</Label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => {
                      setCategory(cat.value);
                      setIcon(cat.icon);
                    }}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                      category === cat.value
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-xs font-medium">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mode */}
            <div className="space-y-2">
              <Label>Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-all ${
                      mode === m.value
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{m.icon}</span>
                      <span className="text-sm font-semibold">{m.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Notifications Toggle */}
            <div className="flex items-center justify-between bg-muted/50 rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bell className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Notifications</p>
                  <p className="text-xs text-muted-foreground">Get step reminders</p>
                </div>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in overflow-y-auto max-h-[50vh] pr-1">
            <p className="text-xs text-muted-foreground mb-2">
              Set a fixed start time for each step. The app will notify you based on real clock time.
            </p>
            {hasOverlap() && (
              <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                ⚠️ Some steps have the same start time. Please use unique times.
              </div>
            )}
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-muted/50 rounded-xl p-3 border border-border/50"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="shrink-0">
                  <Input
                    type="time"
                    value={step.step_start_time}
                    onChange={(e) => updateStep(i, "step_start_time", e.target.value)}
                    className="w-[100px] h-9 text-sm rounded-lg"
                  />
                </div>
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
                    onChange={(e) =>
                      updateStep(i, "duration_minutes", Number(e.target.value) || 1)
                    }
                    className="w-12 h-9 text-center text-xs rounded-lg"
                    min={1}
                  />
                  <span className="text-[10px] text-muted-foreground">min</span>
                </div>
                {steps.length > 1 && (
                  <button onClick={() => removeStep(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addStep}
              className="w-full rounded-xl"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Step
            </Button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-6">
          {page > 0 && (
            <Button
              variant="outline"
              onClick={() => setPage(0)}
              className="flex-1 h-12 rounded-xl"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {page === 0 ? (
            <Button
              onClick={() => setPage(1)}
              disabled={!canProceed}
              className="flex-1 h-12 rounded-xl"
            >
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canProceed || hasOverlap()}
              className="flex-1 h-12 rounded-xl"
            >
              Create Routine 🎯
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
