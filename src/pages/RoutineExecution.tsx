import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, SkipForward, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SafeAreaContainer } from "@/components/layout/SafeAreaContainer";
import {
  useRoutines,
  resolveCurrentStepByTime,
  parseTimeToMinutes,
  type Routine,
  type RoutineLog,
  type RoutineStep,
} from "@/hooks/useRoutines";
import { useToast } from "@/hooks/use-toast";

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getCountdownText(targetMinutes: number, nowMinutes: number): string {
  let diff = targetMinutes - nowMinutes;
  if (diff < 0) return "Now";
  if (diff === 0) return "Now";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

export default function RoutineExecution() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { routines, startRoutine, completeStep, getTodayLog, getCompletedStepIds } = useRoutines();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [log, setLog] = useState<RoutineLog | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [transitioning, setTransitioning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes());

  const steps = useMemo(
    () =>
      (routine?.steps || [])
        .filter((s) => s.step_start_time)
        .sort((a, b) => parseTimeToMinutes(a.step_start_time!) - parseTimeToMinutes(b.step_start_time!)),
    [routine]
  );

  // Update clock every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setNowMinutes(getNowMinutes()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Resolve current step based on clock time
  const currentIndex = useMemo(
    () => resolveCurrentStepByTime(steps, completedIds, nowMinutes),
    [steps, completedIds, nowMinutes]
  );

  const currentStep = steps[currentIndex];
  const nextStep = steps.find(
    (s, i) => i > currentIndex && !completedIds.has(s.id)
  );

  const totalSteps = steps.length;
  const completedCount = completedIds.size;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  const initRoutine = useCallback(async () => {
    if (!id) return;
    const found = routines.find((r) => r.id === id);
    if (!found) {
      setLoading(false);
      return;
    }
    setRoutine(found);

    const existingLog = await getTodayLog(id);
    if (existingLog) {
      if (existingLog.status === "completed") {
        setCompleted(true);
      }
      setLog(existingLog);
      const ids = await getCompletedStepIds(existingLog.id);
      setCompletedIds(ids);
    } else {
      const newLog = await startRoutine(id);
      setLog(newLog);
    }
    setLoading(false);
  }, [id, routines, getTodayLog, startRoutine, getCompletedStepIds]);

  useEffect(() => {
    if (routines.length > 0) {
      initRoutine();
    }
  }, [routines.length, initRoutine]);

  const handleAction = async (action: "completed" | "skipped") => {
    if (!log || !currentStep || transitioning) return;

    setTransitioning(true);

    const newCompletedIds = new Set(completedIds);
    newCompletedIds.add(currentStep.id);

    const isLast = newCompletedIds.size >= totalSteps;
    const nextIdx = resolveCurrentStepByTime(steps, newCompletedIds, nowMinutes);

    const success = await completeStep(
      log.id,
      currentStep.id,
      action,
      nextIdx,
      isLast,
      currentStep.step_start_time
        ? new Date().toISOString() // scheduled_at for delay calc
        : undefined
    );

    if (success) {
      setTimeout(() => {
        setCompletedIds(newCompletedIds);
        if (isLast) {
          setCompleted(true);
          toast({ title: "Routine complete! 🎉" });
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

  if (completed) {
    return (
      <SafeAreaContainer>
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 animate-scale-in">
          <div className="text-7xl mb-6">🎉</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">All Done!</h1>
          <p className="text-muted-foreground text-center mb-2">
            You completed <span className="font-semibold text-foreground">{routine.name}</span>
          </p>
          <p className="text-sm text-primary font-medium mb-8">
            {totalSteps} steps completed
          </p>
          <Button onClick={() => navigate("/tasks")} className="w-full max-w-xs h-12 rounded-xl">
            Back to Tasks
          </Button>
        </div>
      </SafeAreaContainer>
    );
  }

  // If currentIndex >= totalSteps, all visible steps are done but log isn't marked complete yet
  const allDone = currentIndex >= totalSteps;
  const stepStartMin = currentStep?.step_start_time
    ? parseTimeToMinutes(currentStep.step_start_time)
    : 0;
  const isUpcoming = stepStartMin > nowMinutes;
  const isLate = stepStartMin < nowMinutes;

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
                {completedCount}/{totalSteps} steps done
              </p>
            </div>
            <span className="text-2xl">{routine.icon}</span>
          </div>
          <Progress value={progress} className="h-2 rounded-full" />
        </div>

        {/* Current task — centered */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {allDone ? (
            <div className="text-center">
              <div className="text-5xl mb-4">✅</div>
              <p className="text-muted-foreground">All steps are done!</p>
            </div>
          ) : currentStep ? (
            <div
              className={`w-full max-w-sm transition-all duration-400 ${
                transitioning
                  ? "opacity-0 translate-y-8 scale-95"
                  : "opacity-100 translate-y-0 scale-100"
              }`}
            >
              {/* Status indicator */}
              {isUpcoming && (
                <div className="flex items-center justify-center gap-2 mb-3 text-amber-500">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Starts {getCountdownText(stepStartMin, nowMinutes)}
                  </span>
                </div>
              )}
              {isLate && (
                <div className="flex items-center justify-center gap-2 mb-3 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Was scheduled at {formatTime12(currentStep.step_start_time!)}
                  </span>
                </div>
              )}

              {/* Focus card */}
              <div className="bg-primary/5 border-2 border-primary/20 rounded-3xl p-8 text-center shadow-lg">
                <div className="flex items-center justify-center gap-2 mb-4 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-semibold">
                    {formatTime12(currentStep.step_start_time!)}
                  </span>
                  {currentStep.duration_minutes > 0 && (
                    <span className="text-xs opacity-60">
                      (~{currentStep.duration_minutes} min)
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {currentStep.title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isUpcoming
                    ? "Coming up next — get ready!"
                    : isLate
                    ? "You're running late — catch up!"
                    : "Focus on this. Nothing else."}
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
          ) : null}
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
                <span className="text-xs text-muted-foreground font-medium">
                  {nextStep.step_start_time
                    ? formatTime12(nextStep.step_start_time)
                    : ""}
                </span>
              </div>
              {nextStep.step_start_time && (
                <p className="text-xs text-muted-foreground mt-1">
                  {getCountdownText(
                    parseTimeToMinutes(nextStep.step_start_time),
                    nowMinutes
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </SafeAreaContainer>
  );
}
