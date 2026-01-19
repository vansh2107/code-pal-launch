import { memo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, CheckCircle2, Image as ImageIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LazyAIRecommendations } from "./LazyAIRecommendations";

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

interface StatusInfo {
  bgClass: string;
  textClass: string;
  badgeVariant: "default" | "destructive" | "secondary" | "outline";
  label: string;
}

interface OptimizedTaskCardProps {
  task: Task;
  statusInfo: StatusInfo;
  funnyMessage: string | null;
  onRefresh: () => void;
  userTimezone: string;
}

function OptimizedTaskCardComponent({
  task,
  statusInfo,
  funnyMessage,
  onRefresh,
  userTimezone,
}: OptimizedTaskCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completionTime, setCompletionTime] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [completionImage, setCompletionImage] = useState<File | null>(null);

  // Pre-compute display values
  const startTimeLocal = toZonedTime(new Date(task.start_time), userTimezone);
  const displayStartTime = format(startTimeLocal, "h:mm a");

  const handleComplete = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let imagePath = task.image_path;

      if (completionImage) {
        setUploadingImage(true);
        const fileExt = completionImage.name.split(".").pop();
        const fileName = `${user.id}/${task.id}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("task-images")
          .upload(fileName, completionImage);

        if (uploadError) throw uploadError;
        imagePath = fileName;
      }

      const now = new Date();
      const endTime = completionTime
        ? new Date(`${task.task_date}T${completionTime}`)
        : now;

      const startTime = new Date(task.start_time);
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationMinutes = Math.max(0, Math.floor(durationMs / 60000));

      const { error } = await supabase
        .from("tasks")
        .update({
          status: "completed",
          end_time: endTime.toISOString(),
          total_time_minutes: durationMinutes,
          image_path: imagePath,
          reminder_active: false,
        })
        .eq("id", task.id);

      if (error) throw error;

      toast({
        title: "Task completed! 🎉",
        description: `Great job finishing "${task.title}"!`,
      });

      setShowCompleteDialog(false);
      onRefresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to complete task",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
    }
  }, [task, completionTime, completionImage, onRefresh, toast]);

  const handleCardClick = useCallback(() => {
    navigate(`/task/${task.id}`);
  }, [navigate, task.id]);

  const handleCompleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCompleteDialog(true);
  }, []);

  return (
    <>
      <Card
        className={`p-4 cursor-pointer hover:scale-[1.02] transition-transform duration-200 ${statusInfo.bgClass} rounded-xl shadow-sm w-full max-w-full`}
        onClick={handleCardClick}
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-base text-foreground flex-1 mr-2">
            {task.title}
          </h3>
          <Badge variant={statusInfo.badgeVariant} className="shrink-0">
            {statusInfo.label}
          </Badge>
        </div>

        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {task.description}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{displayStartTime}</span>
            </div>
            {task.total_time_minutes && task.status === "completed" && (
              <span className="text-valid">
                {Math.floor(task.total_time_minutes / 60)}h {task.total_time_minutes % 60}m
              </span>
            )}
            {task.image_path && (
              <ImageIcon className="h-4 w-4 text-primary" />
            )}
          </div>

          {task.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={handleCompleteClick}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Complete
            </Button>
          )}
        </div>

        {funnyMessage && (
          <p className="text-xs text-expired mt-2 italic">
            {funnyMessage}
          </p>
        )}

        {/* Lazy-loaded AI Recommendations */}
        <LazyAIRecommendations task={task} />
      </Card>

      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="completionTime">Completion Time (optional)</Label>
              <Input
                id="completionTime"
                type="time"
                value={completionTime}
                onChange={(e) => setCompletionTime(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="completionImage">Attach Image (optional)</Label>
              <Input
                id="completionImage"
                type="file"
                accept="image/*"
                onChange={(e) => setCompletionImage(e.target.files?.[0] || null)}
                className="mt-1"
              />
            </div>
            <Button
              onClick={handleComplete}
              disabled={uploadingImage}
              className="w-full"
            >
              {uploadingImage ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Mark as Complete"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Memoize the card to prevent re-renders when parent state changes
export const OptimizedTaskCard = memo(OptimizedTaskCardComponent, (prev, next) => {
  return (
    prev.task.id === next.task.id &&
    prev.task.status === next.task.status &&
    prev.task.consecutive_missed_days === next.task.consecutive_missed_days &&
    prev.task.title === next.task.title &&
    prev.statusInfo.label === next.statusInfo.label &&
    prev.userTimezone === next.userTimezone
  );
});
