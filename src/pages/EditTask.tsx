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

      // Extract time from stored timestamp without timezone conversion
      // Just parse the ISO string and extract the time components directly
      const startTimeISO = data.start_time; // e.g., "2024-01-15T19:00:00.000Z"
      const datePart = data.task_date; // e.g., "2024-01-15"
      
      // Extract hours and minutes from the ISO string directly
      const timeMatch = startTimeISO.match(/T(\d{2}:\d{2})/);
      const timePart = timeMatch ? timeMatch[1] : "00:00";
      
      // Combine date and time for the datetime-local input
      const formattedTime = `${datePart}T${timePart}`;

      setFormData({
        title: data.title,
        description: data.description || "",
        startTime: formattedTime,
      });
      setExistingImagePath(data.image_path);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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

      // Parse the datetime-local input (already in user's local timezone)
      const [dateStr, timeStr] = formData.startTime.split("T");
      
      // Create a date object representing this time in the user's local timezone
      // and convert to UTC for storage
      const localDateTime = new Date(formData.startTime);
      const utcTime = fromZonedTime(localDateTime, timezone);

      let imagePath = existingImagePath;

      // Upload new image if provided
      if (imageFile) {
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

      const { error } = await supabase
        .from("tasks")
        .update({
          title: formData.title,
          description: formData.description || null,
          start_time: utcTime.toISOString(),
          timezone: timezone,
          image_path: imagePath,
          task_date: dateStr,
        })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Task updated!",
        description: "Your task has been updated successfully.",
      });

      navigate(`/tasks/${id}`);
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
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6 sticky top-0 z-10 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/tasks/${id}`)}
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
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <Card className="p-4 space-y-4">
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
