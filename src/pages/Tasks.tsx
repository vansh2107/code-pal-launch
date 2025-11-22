import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskFutureList } from "@/components/tasks/TaskFutureList";
import { TaskListSkeleton } from "@/components/ui/loading-skeleton";
import { BottomNavigation } from "@/components/layout/BottomNavigation";

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

export default function Tasks() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [futureTasks, setFutureTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [userTimezone, setUserTimezone] = useState("UTC");

  useEffect(() => {
    initializeTasks();
  }, []);

  const initializeTasks = async () => {
    await fetchUserTimezone();
    await carryForwardTasks();
    await fetchTasks();
    await fetchFutureTasks();
  };

  const fetchUserTimezone = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (profile?.timezone) {
          setUserTimezone(profile.timezone);
        }
      }
    } catch (error) {
      console.error("Error fetching timezone:", error);
    }
  }, []);

  const carryForwardTasks = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get today's date in user's timezone
      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const timezone = profile?.timezone || userTimezone;
      const today = new Date().toLocaleDateString("en-CA");
      
      const { data: pendingTasks, error: fetchError } = await supabase
        .from("tasks")
        .select("id, local_date, task_date, original_date, consecutive_missed_days")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .lt("task_date", today);

      if (fetchError) throw fetchError;

      if (pendingTasks && pendingTasks.length > 0) {
        const updates = pendingTasks.map((task) => {
          // Calculate consecutive missed days using LOCAL timezone day boundaries
          // carriedDays = difference_in_days(current_date, original_date)
          const originalDateLocal = new Date(task.original_date + 'T00:00:00');
          const todayDateLocal = new Date(today + 'T00:00:00');
          const daysDiff = Math.floor((todayDateLocal.getTime() - originalDateLocal.getTime()) / (1000 * 60 * 60 * 24));
          
          const newConsecutiveDays = Math.max(0, daysDiff);
          
          return supabase
            .from("tasks")
            .update({
              local_date: today,
              task_date: today,
              consecutive_missed_days: newConsecutiveDays,
            })
            .eq("id", task.id);
        });

        await Promise.all(updates);
      }
    } catch (error) {
      console.error("Carry-forward error:", error);
    }
  }, [userTimezone]);

  const fetchTasks = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get today in user's local timezone
      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const timezone = profile?.timezone || userTimezone;
      const today = new Date().toLocaleDateString("en-CA");
      
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("task_date", today)
        .order("start_time", { ascending: true })
        .limit(100);

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch tasks",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, userTimezone]);

  const fetchFutureTasks = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get today in user's local timezone
      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const timezone = profile?.timezone || userTimezone;
      const today = new Date().toLocaleDateString("en-CA");
      
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .gt("task_date", today)
        .order("task_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(50);

      if (error) throw error;
      setFutureTasks(data || []);
    } catch (error) {
      console.error("Error fetching future tasks:", error);
    }
  }, [userTimezone]);

  const getTaskStatusInfo = (task: Task) => {
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
  };

  const getFunnyMessage = (days: number) => {
    const messages = [
      "Bro… 3 days? Too lazy or too legendary? 😂",
      "Your task is crying… finish it 😭😂",
      "Even your alarm gave up on you! 🤦‍♂️",
      "3 days later... still waiting 😴",
      "This task has trust issues now 💔",
    ];
    return days >= 3 ? messages[Math.floor(Math.random() * messages.length)] : null;
  };

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

  const completedTasks = tasks.filter(t => t.status === "completed");
  const pendingTasks = tasks.filter(t => t.status === "pending");
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="min-h-screen bg-background pb-24 animate-fade-in px-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6 -mx-4 sticky top-0 z-10 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Daily Tasks</h1>
            <p className="text-sm text-muted-foreground">{today}</p>
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
                  <TaskCard
                    key={task.id}
                    task={task}
                    statusInfo={statusInfo}
                    funnyMessage={funnyMessage}
                    onRefresh={fetchTasks}
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
  );
}
