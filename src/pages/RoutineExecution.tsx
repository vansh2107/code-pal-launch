import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, SkipForward, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SafeAreaContainer } from "@/components/layout/SafeAreaContainer";
import { useRoutines, type Routine, type RoutineLog } from "@/hooks/useRoutines";
import { useToast } from "@/hooks/use-toast";

export default function RoutineExecution() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { routines, startRoutine, completeStep, getTodayLog } = useRoutines();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [log, setLog] = useState<RoutineLog | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const steps = routine?.steps || [];
  const currentStep = steps[currentIndex];
  const nextStep = steps[currentIndex + 1];
  const progress = steps.length > 0 ? ((currentIndex) / steps.length) * 100 : 0;

  const initRoutine = useCallback(async () => {
    if (!id) return;
    const found = routines.find((r) => r.id === id);
    if (!found) {
      setLoading(false);
      return;
    }
    setRoutine(found);

    // Check for existing today's log
    const existingLog = await getTodayLog(id);
    if (existingLog) {
      if (existingLog.status === "completed") {
        setCompleted(true);
        setCurrentIndex(found.steps?.length || 0);
        setLog(existingLog);
      } else {
        setLog(existingLog);
        setCurrentIndex(existingLog.current_step_index);
      }
    } else {
      const newLog = await startRoutine(id);
      setLog(newLog);
    }
    setLoading(false);
  }, [id, routines, getTodayLog, startRoutine]);

  useEffect(() => {
    if (routines.length > 0) {
      initRoutine();
    }
  }, [routines.length, initRoutine]);

  const handleAction = async (action: "completed" | "skipped") => {
    if (!log || !currentStep || transitioning) return;

    setTransitioning(true);
    const isLast = currentIndex === steps.length - 1;
    const nextIdx = currentIndex + 1;

    const success = await completeStep(
      log.id,
      currentStep.id,
      action,
      nextIdx,
      isLast
    );

    if (success) {
      // Animate out
      setTimeout(() => {
        if (isLast) {
          setCompleted(true);
          toast({ title: "Routine complete! 🎉" });
        } else {
          setCurrentIndex(nextIdx);
        }
        setTransitioning(false);
      }, 400);
    } else {
      setTransitioning(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaContainer>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </SafeAreaContainer>
    );
  }

  if (!routine) {
    return (
      <SafeAreaContainer>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
          <p className="text-muted-foreground mb-4">Routine not found</p>
          <Button onClick={() => navigate("/tasks")}>Go Back</Button>
        </div>
      </SafeAreaContainer>
    );
  }

  // Completion screen
  if (completed) {
    return (
      <SafeAreaContainer>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 animate-scale-in">
          <div className="text-7xl mb-6">🎉</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            All Done!
          </h1>
          <p className="text-muted-foreground text-center mb-2">
            You completed <span className="font-semibold text-foreground">{routine.name}</span>
          </p>
          <p className="text-sm text-valid font-medium mb-8">
            {steps.length} steps completed
          </p>
          <Button
            onClick={() => navigate("/tasks")}
            className="w-full max-w-xs h-12 rounded-xl"
          >
            Back to Tasks
          </Button>
        </div>
      </SafeAreaContainer>
    );
  }

  return (
    <SafeAreaContainer>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => navigate("/tasks")}
              className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <h1 className="font-semibold text-foreground">{routine.name}</h1>
              <p className="text-xs text-muted-foreground">
                Step {currentIndex + 1} of {steps.length}
              </p>
            </div>
            <span className="text-2xl">{routine.icon}</span>
          </div>
          <Progress value={progress} className="h-2 rounded-full" />
        </div>

        {/* Current task — centered */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div
            className={`w-full max-w-sm transition-all duration-400 ${
              transitioning
                ? "opacity-0 translate-y-8 scale-95"
                : "opacity-100 translate-y-0 scale-100"
            }`}
          >
            {/* Focus card */}
            <div className="bg-primary-soft border-2 border-primary/20 rounded-3xl p-8 text-center shadow-lg">
              <div className="flex items-center justify-center gap-2 mb-4 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {currentStep?.duration_minutes} min
                </span>
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {currentStep?.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                Focus on this. Nothing else.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mt-8">
              <Button
                onClick={() => handleAction("skipped")}
                variant="outline"
                className="flex-1 h-14 rounded-2xl text-base border-2"
                disabled={transitioning}
              >
                <SkipForward className="h-5 w-5 mr-2" />
                Skip
              </Button>
              <Button
                onClick={() => handleAction("completed")}
                className="flex-1 h-14 rounded-2xl text-base"
                disabled={transitioning}
              >
                <Check className="h-5 w-5 mr-2" />
                Done
              </Button>
            </div>
          </div>
        </div>

        {/* Next task preview */}
        {nextStep && (
          <div className="px-6 pb-8">
            <div className="bg-muted/50 rounded-2xl p-4 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">
                Up Next
              </p>
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">{nextStep.title}</p>
                <span className="text-xs text-muted-foreground">
                  {nextStep.duration_minutes} min
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </SafeAreaContainer>
  );
}
