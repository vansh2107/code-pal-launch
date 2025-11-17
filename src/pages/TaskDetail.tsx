import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, Clock, Calendar, Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [timezone, setTimezone] = useState("UTC");

  useEffect(() => {
    fetchUserTimezone();
    fetchTask();
  }, [id]);

  const fetchUserTimezone = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .single();
      
      if (profile?.timezone) {
        setTimezone(profile.timezone);
      }
    }
  };

  const fetchTask = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setTask(data);

      if (data.image_path) {
        const { data: urlData } = supabase.storage
          .from("task-images")
          .getPublicUrl(data.image_path);
        setImageUrl(urlData.publicUrl);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      navigate("/tasks");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      // Delete image if exists
      if (task.image_path) {
        await supabase.storage
          .from("task-images")
          .remove([task.image_path]);
      }

      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Task deleted",
        description: "Your task has been removed.",
      });

      navigate("/tasks");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatTimeInTimezone = (utcTime: string) => {
    const zonedTime = toZonedTime(new Date(utcTime), timezone);
    return format(zonedTime, "h:mm a");
  };

  if (loading || !task) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6 sticky top-0 z-10 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/tasks")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Task Details</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {task?.status === "pending" && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate(`/tasks/${id}/edit`)}
              >
                <Edit className="h-5 w-5" />
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Task?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your task.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">{task.title}</h2>
            {task.description && (
              <p className="text-muted-foreground">{task.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant={
                task.status === "completed"
                  ? "default"
                  : task.consecutive_missed_days >= 3
                  ? "destructive"
                  : task.consecutive_missed_days > 0
                  ? "secondary"
                  : "outline"
              }
            >
              {task.status === "completed"
                ? "Completed"
                : task.consecutive_missed_days >= 3
                ? `Overdue ${task.consecutive_missed_days} days`
                : task.consecutive_missed_days > 0
                ? `Carried ${task.consecutive_missed_days} days`
                : "Pending"}
            </Badge>
          </div>

          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Task Date</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(task.task_date), "EEEE, MMM d, yyyy")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Start Time</p>
                <p className="text-sm text-muted-foreground">
                  {formatTimeInTimezone(task.start_time)} ({timezone})
                </p>
              </div>
            </div>

            {task.end_time && (
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Completed At</p>
                  <p className="text-sm text-muted-foreground">
                    {formatTimeInTimezone(task.end_time)} ({timezone})
                  </p>
                </div>
              </div>
            )}

            {task.total_time_minutes && (
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Time Taken</p>
                  <p className="text-sm text-muted-foreground">
                    {task.total_time_minutes} minutes
                  </p>
                </div>
              </div>
            )}
          </div>

          {imageUrl && (
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">Attached Image</p>
              <img
                src={imageUrl}
                alt="Task"
                className="rounded-lg w-full h-auto max-h-96 object-cover"
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
