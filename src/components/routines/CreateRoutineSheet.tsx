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

interface CreateRoutineSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, icon: string) => void;
}

export function CreateRoutineSheet({
  open,
  onOpenChange,
  onSubmit,
}: CreateRoutineSheetProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  const canSubmit = name.trim().length > 0;

  const handlePresetClick = (preset: typeof ROUTINE_PRESETS[0]) => {
    setName(preset.name);
    setIcon(preset.icon);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(name.trim(), icon || "⚡");
    setName("");
    setIcon("");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName("");
      setIcon("");
    }
    onOpenChange(open);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-auto rounded-t-3xl px-4 pb-8">
        <SheetHeader className="mb-4">
          <SheetTitle>Create Routine</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
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

          {/* Editable name field so user can customize */}
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
