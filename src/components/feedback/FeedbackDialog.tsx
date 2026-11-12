import { useState, useEffect } from "react";
import { firebaseDb } from "@/integrations/firebase/client";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageSquarePlus, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const LOCAL_STORAGE_FEEDBACK_KEY = "remonk_unsent_feedback";

export function FeedbackDialog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("general");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Restore unsent message from local cache
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_FEEDBACK_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.feedback) setFeedback(parsed.feedback);
        if (parsed?.category) setCategory(parsed.category);
      }
    } catch { /* ignore */ }
  }, []);

  // Save changes locally until successful submission
  const handleFeedbackChange = (val: string) => {
    setFeedback(val);
    try {
      localStorage.setItem(LOCAL_STORAGE_FEEDBACK_KEY, JSON.stringify({ category, feedback: val }));
    } catch { /* ignore */ }
  };

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    try {
      localStorage.setItem(LOCAL_STORAGE_FEEDBACK_KEY, JSON.stringify({ category: val, feedback }));
    } catch { /* ignore */ }
  };

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter your feedback before submitting.",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Sign In Required",
        description: "You must be signed in to submit feedback.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    setLastError(null);

    try {
      // Write under authenticated user's scope
      await addDoc(collection(firebaseDb, `users/${user.uid}/feedback`), {
        userId: user.uid,
        userEmail: user.email || null,
        category,
        feedback: feedback.trim(),
        createdAt: serverTimestamp(),
      });

      toast({
        title: "Thank you!",
        description: "Your feedback has been submitted successfully.",
      });

      // Clear cached draft and reset form
      try {
        localStorage.removeItem(LOCAL_STORAGE_FEEDBACK_KEY);
      } catch { /* ignore */ }
      setFeedback("");
      setCategory("general");
      setOpen(false);
    } catch (error: any) {
      console.error("[FeedbackDialog] Submission error:", error);
      const errMsg = error?.message || "Failed to submit feedback. Your draft has been preserved.";
      setLastError(errMsg);
      toast({
        title: "Submission Error",
        description: "Failed to send feedback. Your draft is saved locally. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 min-h-[44px]">
          <MessageSquarePlus className="h-4 w-4" />
          Send Feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Your Feedback</DialogTitle>
          <DialogDescription>
            Help us improve Remonk Reminder. We read every piece of feedback!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={handleCategoryChange} disabled={submitting}>
              <SelectTrigger id="category" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="bug">Report a Bug</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="document_scanner">Scanner &amp; Extraction</SelectItem>
                <SelectItem value="notifications">Reminders &amp; Alerts</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback">Your Feedback</Label>
            <Textarea
              id="feedback"
              value={feedback}
              onChange={(e) => handleFeedbackChange(e.target.value)}
              placeholder="Tell us what you love or what could be better..."
              rows={4}
              disabled={submitting}
              className="resize-none"
            />
          </div>

          {lastError && (
            <div className="p-3 text-xs bg-destructive/10 text-destructive rounded-lg flex items-center justify-between">
              <span>{lastError}</span>
              <Button type="button" size="sm" variant="ghost" onClick={handleSubmit} className="h-7 px-2 text-xs">
                <RefreshCw className="h-3 w-3 mr-1" /> Retry
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting} className="min-h-[44px]">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !feedback.trim()} className="min-h-[44px]">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Feedback"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
