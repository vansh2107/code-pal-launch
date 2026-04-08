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

const ICONS = ["☀️", "🌙", "💪", "📚", "🧘", "🏃", "🎯", "⚡"];

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
  const [icon, setIcon] = useState("☀️");

  const canSubmit = name.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(name.trim(), icon);
    setName("");
    setIcon("☀️");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto rounded-t-3xl px-4 pb-8">
        <SheetHeader className="mb-4">
          <SheetTitle>Create Routine</SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Routine Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning Routine"
              className="h-11 text-base rounded-xl"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Icon
            </Label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={cn(
                    "w-11 h-11 rounded-xl text-xl flex items-center justify-center border-2 transition-all",
                    icon === ic
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  )}
                >
                  {ic}
                </button>
              ))}
            </div>
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
