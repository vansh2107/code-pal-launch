import { useMemo, useCallback, useState, useRef } from "react";
import { useSwipeable } from "react-swipeable";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptimizedTaskCard } from "@/components/tasks/OptimizedTaskCard";
import { TaskFutureList } from "@/components/tasks/TaskFutureList";
import { TaskListSkeleton } from "@/components/ui/loading-skeleton";
import { AppShell, PageHeader } from "@/components/layout";
import { useTasksData } from "@/hooks/useTasksData";
import { RoutinesSection } from "@/components/routines/RoutinesSection";
import { isTaskOverdue } from "@/utils/dateUtils";

interface Task {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  total_time_minutes: number | null;
  status: string;
  image_path: string | null;
  consecutive_missed_days: number;
  task_date: string;
  original_date: string;
  local_date: string;
}

// Pre-computed funny messages array (static)
const FUNNY_MESSAGES = [
  "Bro… 3 days? Too lazy or too legendary? 😂",
  "Your task is crying… finish it 😭😂",
  "Even your alarm gave up on you! 🤦‍♂️",
  "3 days later... still waiting 😴",
  "This task has trust issues now 💔",
];

export default function Tasks() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterParam = searchParams.get("filter") || searchParams.get("status");

  const { tasks, futureTasks, loading, userTimezone, refreshTasks } = useTasksData();
  const [activeTab, setActiveTab] = useState<"tasks" | "routines">("tasks");
  const [slideDir, setSlideDir] = useState<"left" | "right" | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const switchTab = useCallback((tab: "tasks" | "routines") => {
    if (tab === activeTab) return;
    setSlideDir(tab === "routines" ? "left" : "right");
    // Brief delay for exit animation, then switch
    setTimeout(() => {
      setActiveTab(tab);
      setSlideDir(null);
    }, 150);
  }, [activeTab]);

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => switchTab("routines"),
    onSwipedRight: () => switchTab("tasks"),
    delta: 30,
    preventScrollOnSwipe: true,
    trackTouch: true,
    trackMouse: false,
    swipeDuration: 500,
  });

  // Memoize status calculation
  const getTaskStatusInfo = useCallback((task: Task) => {
    if (task.status === "completed") {
      return {
        bgClass: "bg-valid-bg border-valid/30",
        textClass: "text-valid-foreground",
        badgeVariant: "default" as const,
        label: "Completed",
      };
    } else if (task.status === "cancelled") {
      return {
        bgClass: "bg-muted border-border/50",
        textClass: "text-muted-foreground",
        badgeVariant: "outline" as const,
        label: "Cancelled",
      };
    } else if (task.status === "rejected") {
      return {
        bgClass: "bg-destructive/10 border-destructive/20",
        textClass: "text-destructive",
        badgeVariant: "outline" as const,
        label: "Rejected",
      };
    } else if (isTaskOverdue(task)) {
      const days = task.consecutive_missed_days;
      return {
        bgClass: "bg-expired-bg border-expired/30",
        textClass: "text-expired-foreground",
        badgeVariant: "destructive" as const,
        label: days > 0 ? `Overdue ${days} day${days > 1 ? 's' : ''}` : "Overdue",
      };
    } else if (task.status === "in_progress") {
      return {
        bgClass: "bg-primary/10 border-primary/30",
        textClass: "text-primary",
        badgeVariant: "secondary" as const,
        label: "In Progress",
      };
    }
    return {
      bgClass: "bg-card border-border/80",
      textClass: "text-foreground",
      badgeVariant: "outline" as const,
      label: "Pending",
    };
  }, []);

  const getFunnyMessage = useCallback((days: number) => {
    if (days < 3) return null;
    // Use task count as pseudo-random seed for consistency
    return FUNNY_MESSAGES[days % FUNNY_MESSAGES.length];
  }, []);

  // Memoize computed values & status filters
  const { completedTasks, pendingTasks, displayedTasks, todayFormatted } = useMemo(() => {
    const completed = tasks.filter(t => t.status === "completed");
    const activeIncomplete = tasks.filter(t => !["completed", "cancelled", "rejected"].includes(t.status));

    let filtered = tasks;
    if (filterParam && filterParam !== "all") {
      if (filterParam === "overdue") {
        filtered = tasks.filter(t => isTaskOverdue(t));
      } else if (filterParam === "pending") {
        filtered = tasks.filter(t => t.status === "pending" && !isTaskOverdue(t));
      } else if (filterParam === "in_progress") {
        filtered = tasks.filter(t => t.status === "in_progress");
      } else if (filterParam === "completed") {
        filtered = tasks.filter(t => t.status === "completed");
      } else if (filterParam === "cancelled") {
        filtered = tasks.filter(t => t.status === "cancelled");
      } else if (filterParam === "rejected") {
        filtered = tasks.filter(t => t.status === "rejected");
      }
    }

    const todayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return {
      completedTasks: completed,
      pendingTasks: activeIncomplete,
      displayedTasks: filtered,
      todayFormatted: todayFormatter.format(new Date()),
    };
  }, [tasks, userTimezone, filterParam]);

  // Loading state with skeleton
  if (loading) {
    return (
      <AppShell contentWidth="full">
        <div className="bg-background/80 backdrop-blur-xl p-6 sticky top-0 z-10 backdrop-blur-xl border-b border-border/50 -mx-4 md:-mx-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">Daily Tasks</h1>
          <p className="text-sm text-muted-foreground">Track your daily activities</p>
        </div>
        <div className="pt-4">
          <TaskListSkeleton />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell contentWidth="full" className="animate-fade-in">
      <div {...swipeHandlers} className="w-full">
        <div className="bg-background/80 backdrop-blur-xl p-4 -mx-4 md:-mx-6 sticky top-0 z-10 border-b border-border/50 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Daily Tasks</h1>
              <p className="text-sm text-muted-foreground">{todayFormatted}</p>
            </div>
            <Button 
              onClick={() => navigate("/task-history")}
              variant="outline"
              size="sm"
              className="rounded-full"
            >
              History
            </Button>
          </div>

          {activeTab === "tasks" && (
            <div className="flex gap-3">
              <div className="flex-1 bg-card/50 backdrop-blur-sm rounded-[16px] p-3 border border-border/50">
                <p className="text-xs text-muted-foreground mb-1">Pending</p>
                <p className="text-xl font-bold text-foreground">{pendingTasks.length}</p>
              </div>
              <div className="flex-1 bg-valid-bg/50 backdrop-blur-sm rounded-[16px] p-3 border border-valid/30">
                <p className="text-xs text-foreground mb-1">Completed</p>
                <p className="text-xl font-bold text-valid">{completedTasks.length}</p>
              </div>
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex gap-1 mt-3 bg-muted/50 rounded-xl p-1">
            <button
              onClick={() => switchTab("tasks")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === "tasks"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              📋 Tasks
            </button>
            <button
              onClick={() => switchTab("routines")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === "routines"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🔄 Routines
            </button>
          </div>
        </div>

        <div
          ref={contentRef}
          className={`py-4 space-y-6 transition-all duration-150 ease-out ${
            slideDir === "left"
              ? "-translate-x-8 opacity-0"
              : slideDir === "right"
              ? "translate-x-8 opacity-0"
              : "translate-x-0 opacity-100"
          }`}
        >
          {activeTab === "routines" ? (
            <RoutinesSection />
          ) : (
            <>
              {/* Today's Tasks */}
              <div className="space-y-4">
              {displayedTasks.length === 0 ? (
                <div className="text-center py-16 animate-fade-in">
                  <div className="text-6xl mb-4">📋</div>
                  <h3 className="text-lg font-semibold text-foreground">No tasks for today</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tap + to add a new task
                  </p>
                </div>
                ) : (
                  <>
                    {displayedTasks.map((task) => {
                      const statusInfo = getTaskStatusInfo(task);
                      const funnyMessage = getFunnyMessage(task.consecutive_missed_days);
                      
                      return (
                        <OptimizedTaskCard
                          key={task.id}
                          task={task}
                          statusInfo={statusInfo}
                          funnyMessage={funnyMessage}
                          onRefresh={refreshTasks}
                          userTimezone={userTimezone}
                        />
                      );
                    })}
                  </>
                )}
              </div>

              {/* Future Tasks */}
              {futureTasks.length > 0 && (
                <div className="pt-6 border-t border-border">
                  <TaskFutureList tasks={futureTasks} userTimezone={userTimezone} />
                </div>
              )}
            </>
          )}
        </div>

        {activeTab === "tasks" && (
          <Button
            onClick={() => navigate("/add-task")}
            className="fixed h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform z-40 md:left-[calc(50%+8rem)] left-[50%] -translate-x-1/2"
            style={{
              bottom: 'calc(var(--nav-height) + var(--safe-area-bottom) + var(--fab-gap))',
            }}
            size="icon"
          >
            <Plus className="h-6 w-6" />
          </Button>
        )}
      </div>
    </AppShell>
  );
}
