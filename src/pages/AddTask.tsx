import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

export default function AddTask() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });

  useEffect(() => {
    fetchUserTimezone();
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
        setTimezone(profile.timezone);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Convert local time to UTC for storage
      const localTime = new Date(formData.startTime);
      const utcTime = fromZonedTime(localTime, timezone);

      let imagePath = null;

      // Upload image if provided
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("task-images")
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;
        imagePath = fileName;
      }

      const taskDate = format(utcTime, "yyyy-MM-dd");

      const { error } = await supabase.from("tasks").insert({
        user_id: user.id,
        title: formData.title,
        description: formData.description || null,
        start_time: utcTime.toISOString(),
        timezone: timezone,
        image_path: imagePath,
        task_date: taskDate,
        original_date: taskDate,
        status: "pending",
      });

      if (error) throw error;

      toast({
        title: "Task created!",
        description: "Your task has been added successfully.",
      });

      navigate("/tasks");
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

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/20 via-primary/10 to-background p-6 sticky top-0 z-10 backdrop-blur-xl border-b border-border/50">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/tasks")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">New Task</h1>
            <p className="text-sm text-muted-foreground">Create a daily task</p>
          </div>
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
            <Label htmlFor="image">Attach Image (Optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
              {imageFile && (
                <Upload className="h-5 w-5 text-primary" />
              )}
            </div>
          </div>
        </Card>

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? "Creating..." : "Create Task"}
        </Button>
      </form>
    </div>
  );
}
