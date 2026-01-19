import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { clearTasksCache } from "@/hooks/useTasksData";
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

export default function EditTask() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImagePath, setExistingImagePath] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    startTime: "",
  });

  useEffect(() => {
    fetchUserTimezone();
    fetchTask();
  }, [id]);

  const fetchUserTimezone = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (profile?.timezone) {
          setTimezone(profile.timezone);
        }
      }
    } catch (error) {
      console.error("Error fetching timezone:", error);
    }
  };

  const fetchTask = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast({
          title: "Task not found",
          description: "The requested task could not be found.",
          variant: "destructive",
        });
        navigate("/tasks");
        return;
      }

      // Convert UTC timestamp to user's local timezone for display
      const startTimeUtc = new Date(data.start_time);
      const startTimeLocal = toZonedTime(startTimeUtc, data.timezone || timezone);
      
      // Format for datetime-local input (YYYY-MM-DDTHH:mm)
      const formattedTime = format(startTimeLocal, "yyyy-MM-dd'T'HH:mm");

      setFormData({
        title: data.title,
        description: data.description || "",
        startTime: formattedTime,
      });
      setExistingImagePath(data.image_path);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch task",
        variant: "destructive",
      });
      navigate("/tasks");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch the current task to check if start_time changed
      const { data: currentTask } = await supabase
        .from("tasks")
        .select("start_time")
        .eq("id", id)
        .single();

      // Parse the datetime-local input and convert from user's timezone to UTC
      const [dateStr, timeStr] = formData.startTime.split("T");
      const [hours, minutes] = timeStr.split(":");
      
      // Create date object in user's local timezone (not browser timezone)
      const [year, month, day] = dateStr.split("-").map(Number);
      const localDateTime = new Date(year, month - 1, day, parseInt(hours), parseInt(minutes));
      
      // Convert from user's local timezone to UTC for storage
      const utcTime = fromZonedTime(localDateTime, timezone);
      
      // Calculate local_date in yyyy-mm-dd format for filtering
      const localDate = dateStr;

      // Check if start time changed and if new time is in the future
      const startTimeChanged = currentTask && currentTask.start_time !== utcTime.toISOString();
      const now = new Date();
      const newTimeInFuture = utcTime.getTime() > now.getTime();
      const shouldResetNotifications = startTimeChanged && newTimeInFuture;

      let imagePath = existingImagePath;

      // Upload new image if provided
      if (imageFile) {
        // Validate file size (max 20MB)
        const maxSize = 20 * 1024 * 1024; // 20MB in bytes
        if (imageFile.size > maxSize) {
          throw new Error("File size exceeds 20MB limit");
        }
        
        const fileExt = imageFile.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("task-images")
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;
        
        // Delete old image if exists
        if (existingImagePath) {
          await supabase.storage
            .from("task-images")
            .remove([existingImagePath]);
        }
        
        imagePath = fileName;
      }

      // Prepare update data
      // CRITICAL: DO NOT update original_date or start_time unless explicitly changing the task
      const updateData: any = {
        title: formData.title,
        description: formData.description || null,
        image_path: imagePath,
        reminder_active: true,
      };

      // Only update start_time if it actually changed
      if (startTimeChanged) {
        updateData.start_time = utcTime.toISOString();
        updateData.timezone = timezone;
        updateData.local_date = localDate;
        updateData.task_date = localDate;
        // Also reset original_date if start time changed to a new date
        updateData.original_date = localDate;
      }

      // Only reset notification flags if start time changed to a future time
      if (shouldResetNotifications) {
        updateData.last_reminder_sent_at = null;
        updateData.start_notified = false;
      }

      const { error } = await supabase
        .from("tasks")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      const message = shouldResetNotifications 
        ? "Task updated! You'll receive a notification at the new start time."
        : "Your task has been updated successfully.";

      // Clear cache so Tasks page refetches fresh data
      clearTasksCache();

      toast({
        title: "Task updated!",
        description: message,
      });

      navigate(`/task/${id}`);
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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Delete image if exists
      if (existingImagePath) {
        await supabase.storage
          .from("task-images")
          .remove([existingImagePath]);
      }

      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Clear cache so Tasks page refetches fresh data
      clearTasksCache();

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
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 px-4" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6 -mx-4 sticky top-0 z-10 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/task/${id}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Edit Task</h1>
              <p className="text-sm text-muted-foreground">Update task details</p>
            </div>
          </div>
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
                <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4 w-full max-w-full">
        <Card className="p-4 space-y-4 rounded-xl shadow-sm w-full">
          <div>
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Morning workout, Buy groceries"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Add details about your task..."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="start-time">Start Time *</Label>
            <Input
              id="start-time"
              type="datetime-local"
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Your timezone: {timezone}
            </p>
          </div>

          <div>
            <Label htmlFor="image">Update Image (Optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
              {(imageFile || existingImagePath) && (
                <Upload className="h-5 w-5 text-primary" />
              )}
            </div>
            {existingImagePath && !imageFile && (
              <p className="text-xs text-muted-foreground mt-1">Current image will be kept</p>
            )}
            {imageFile && (
              <p className="text-xs text-muted-foreground mt-1">New image will replace existing</p>
            )}
          </div>
        </Card>

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? "Updating..." : "Update Task"}
        </Button>
      </form>
      <BottomNavigation />
    </div>
  );
}
