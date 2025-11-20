import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageSquarePlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function FeedbackDialog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("general");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      toast({
        title: "Error",
        description: "Please enter your feedback",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('audit_logs')
        .insert([{
          user_id: user?.id,
          action: 'user_feedback',
          entity_type: 'feedback',
          changes: {
            category,
            feedback,
            timestamp: new Date().toISOString()
          }
        }]);

      if (error) throw error;

      toast({
        title: "Thank you!",
        description: "Your feedback has been submitted successfully",
      });

      setFeedback("");
      setCategory("general");
      setOpen(false);
    } catch (error) {
      console.error("Feedback submission error:", error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          Send Feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Your Feedback</DialogTitle>
          <DialogDescription>
            Help us improve Remonk Reminder by sharing your thoughts and suggestions
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Feedback</SelectItem>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="improvement">Improvement Suggestion</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="feedback">Your Feedback</Label>
            <Textarea
              id="feedback"
              placeholder="Tell us what you think..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={5}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
