import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptimizedTaskCard } from "@/components/tasks/OptimizedTaskCard";
import { TaskFutureList } from "@/components/tasks/TaskFutureList";
import { TaskListSkeleton } from "@/components/ui/loading-skeleton";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { SafeAreaContainer } from "@/components/layout/SafeAreaContainer";
import { useTasksData } from "@/hooks/useTasksData";

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
  const { tasks, futureTasks, loading, userTimezone, refreshTasks } = useTasksData();

  // Memoize status calculation
  const getTaskStatusInfo = useCallback((task: Task) => {
    if (task.status === "completed") {
      return {
        bgClass: "bg-valid-bg border-valid/30",
        textClass: "text-valid-foreground",
        badgeVariant: "default" as const,
        label: "Completed",
      };
    } else if (task.consecutive_missed_days >= 3) {
      return {
        bgClass: "bg-expired-bg border-expired/30",
        textClass: "text-expired-foreground",
        badgeVariant: "destructive" as const,
        label: `Overdue ${task.consecutive_missed_days} days`,
      };
    } else if (task.consecutive_missed_days > 0) {
      return {
        bgClass: "bg-expiring-bg border-expiring/30",
        textClass: "text-expiring-foreground",
        badgeVariant: "secondary" as const,
        label: `Carried ${task.consecutive_missed_days} day${task.consecutive_missed_days > 1 ? 's' : ''}`,
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

  // Memoize computed values
  const { completedTasks, pendingTasks, todayFormatted } = useMemo(() => {
    const completed = tasks.filter(t => t.status === "completed");
    const pending = tasks.filter(t => t.status === "pending");
    
    const todayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    return {
      completedTasks: completed,
      pendingTasks: pending,
      todayFormatted: todayFormatter.format(new Date()),
    };
  }, [tasks, userTimezone]);

  // Loading state with skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6 sticky top-0 z-10 backdrop-blur-xl border-b border-border/50">
          <h1 className="text-2xl font-bold text-foreground mb-2">Daily Tasks</h1>
          <p className="text-sm text-muted-foreground">Track your daily activities</p>
        </div>
        <div className="p-4">
          <TaskListSkeleton />
        </div>
        <BottomNavigation />
      </div>
    );
  }

  return (
    <SafeAreaContainer>
      <div className="min-h-screen bg-background pb-24 animate-fade-in px-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-4 -mx-4 sticky top-0 z-10 backdrop-blur-xl border-b border-border/50">
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

          <div className="flex gap-3">
            <div className="flex-1 bg-card/50 backdrop-blur-sm rounded-[16px] p-3 border border-border/50">
              <p className="text-xs text-muted-foreground mb-1">Pending</p>
              <p className="text-xl font-bold text-foreground">{pendingTasks.length}</p>
            </div>
            <div className="flex-1 bg-valid-bg/50 backdrop-blur-sm rounded-[16px] p-3 border border-valid/30">
              <p className="text-xs text-valid-foreground mb-1">Completed</p>
              <p className="text-xl font-bold text-valid">{completedTasks.length}</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Today's Tasks */}
          <div className="space-y-4">
            {tasks.length === 0 ? (
              <div className="text-center py-16 space-y-4 animate-fade-in">
                <div className="text-6xl mb-4">📋</div>
                <h3 className="text-lg font-semibold text-foreground">No tasks for today</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Start planning your day by adding your first task
                </p>
                <Button
                  onClick={() => navigate("/add-task")}
                  className="rounded-full px-8"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Add Your First Task
                </Button>
              </div>
            ) : (
              <>
                {tasks.map((task) => {
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
        </div>

        <Button
          onClick={() => navigate("/add-task")}
          className="fixed h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform z-40"
          style={{
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)'
          }}
          size="icon"
        >
          <Plus className="h-6 w-6" />
        </Button>

        <BottomNavigation />
      </div>
    </SafeAreaContainer>
  );
}
