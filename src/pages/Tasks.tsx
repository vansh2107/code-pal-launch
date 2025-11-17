import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Calendar, Clock, Image as ImageIcon, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format, isToday } from "date-fns";
import { TaskCard } from "@/components/tasks/TaskCard";
import { Skeleton } from "@/components/ui/skeleton";
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
}

export default function Tasks() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [userTimezone, setUserTimezone] = useState("UTC");

  useEffect(() => {
    fetchUserTimezone();
    fetchTasks();
  }, []);

  const fetchUserTimezone = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .single();
      
      if (profile?.timezone) {
        setUserTimezone(profile.timezone);
      }
    }
  };

  const fetchTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("task_date", today)
        .order("start_time", { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
        <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">Daily Tasks</h1>
          <p className="text-sm text-muted-foreground">Track your daily activities</p>
        </div>
        <div className="p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-[14px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6 sticky top-0 z-10 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Daily Tasks</h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), "EEEE, MMM d")} • {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            onClick={() => navigate("/tasks/history")}
            variant="outline"
            size="sm"
          >
            <Calendar className="h-4 w-4 mr-2" />
            History
          </Button>
        </div>
      </div>

      {/* Tasks List */}
      <div className="p-4 space-y-4">
        {tasks.length === 0 ? (
          <Card className="p-8 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No tasks for today</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first task to get started!
            </p>
            <Button onClick={() => navigate("/tasks/add")}>
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </Card>
        ) : (
          tasks.map((task) => {
            const statusInfo = getTaskStatusInfo(task);
            const funnyMessage = getFunnyMessage(task.consecutive_missed_days);
            
            return (
              <TaskCard
                key={task.id}
                task={task}
                statusInfo={statusInfo}
                funnyMessage={funnyMessage}
                onRefresh={fetchTasks}
              />
            );
          })
        )}
      </div>

      {/* Floating Add Button */}
      <Button
        onClick={() => navigate("/tasks/add")}
        className="fixed bottom-24 right-6 h-14 w-14 rounded-full shadow-lg btn-glow"
        size="icon"
      >
        <Plus className="h-6 w-6" />
      </Button>
      <BottomNavigation />
    </div>
  );
}
