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
import { Plus, Trash2, GripVertical, ArrowRight, ArrowLeft } from "lucide-react";

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

interface Step {
  title: string;
  duration_minutes: number;
}

interface CreateRoutineSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    name: string,
    category: string,
    icon: string,
    steps: Step[],
    options?: { mode?: string; auto_adjust?: boolean; start_time?: string }
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
  const [steps, setSteps] = useState<Step[]>([
    { title: "", duration_minutes: 5 },
  ]);

  const addStep = () =>
    setSteps((s) => [...s, { title: "", duration_minutes: 5 }]);

  const removeStep = (i: number) =>
    setSteps((s) => s.filter((_, idx) => idx !== i));

  const updateStep = (i: number, field: keyof Step, value: string | number) =>
    setSteps((s) =>
      s.map((step, idx) => (idx === i ? { ...step, [field]: value } : step))
    );

  const handleSubmit = () => {
    const validSteps = steps.filter((s) => s.title.trim());
    if (!name.trim() || validSteps.length === 0) return;
    onSubmit(name.trim(), category, icon, validSteps, { mode, auto_adjust: autoAdjust });
    // Reset
    setPage(0);
    setName("");
    setCategory("morning");
    setIcon("☀️");
    setMode("flexible");
    setAutoAdjust(true);
    setSteps([{ title: "", duration_minutes: 5 }]);
  };

  const canProceed = page === 0 ? name.trim().length > 0 : steps.some((s) => s.title.trim());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl px-4 pb-8">
        <SheetHeader className="mb-4">
          <SheetTitle>
            {page === 0 ? "Create Routine" : "Add Steps"}
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
          <div className="space-y-6 animate-fade-in">
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
                        ? "border-primary bg-primary-soft"
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
                        ? "border-primary bg-primary-soft"
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
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in overflow-y-auto max-h-[50vh] pr-1">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-muted/50 rounded-xl p-3 border border-border/50"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
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
                    className="w-14 h-9 text-center text-sm rounded-lg"
                    min={1}
                  />
                  <span className="text-xs text-muted-foreground">min</span>
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
              disabled={!canProceed}
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
