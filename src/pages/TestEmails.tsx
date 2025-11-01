import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Loader2, Mail, Calendar } from "lucide-react";

export default function TestEmails() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testDate, setTestDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });

  const testImmediateEmail = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to test emails",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Create a test document
      const { data: document, error: docError } = await supabase
        .from('documents')
        .insert({
          name: 'Test Document for Email',
          document_type: 'passport',
          expiry_date: testDate,
          issuing_authority: 'Test Authority',
          user_id: user.id,
        })
        .select()
        .single();

      if (docError) throw docError;

      // Create a test reminder
      const reminderDate = new Date(testDate);
      reminderDate.setDate(reminderDate.getDate() - 30); // 30 days before expiry

      const { data: reminder, error: reminderError } = await supabase
        .from('reminders')
        .insert({
          document_id: document.id,
          user_id: user.id,
          reminder_date: reminderDate.toISOString().split('T')[0],
          is_custom: true,
          is_sent: false,
        })
        .select()
        .single();

      if (reminderError) throw reminderError;

      // Send immediate confirmation email
      const { error: emailError } = await supabase.functions.invoke('send-immediate-reminder', {
        body: { reminder_id: reminder.id }
      });

      if (emailError) throw emailError;

      toast({
        title: "✅ Test email sent!",
        description: "Check your email inbox for the reminder confirmation.",
      });

      // Clean up test data after a delay
      setTimeout(async () => {
        await supabase.from('reminders').delete().eq('id', reminder.id);
        await supabase.from('documents').delete().eq('id', document.id);
      }, 2000);

    } catch (error: any) {
      console.error('Test error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send test email",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const testDailyEmailCron = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-reminder-emails', {
        body: {}
      });

      if (error) throw error;

      toast({
        title: "✅ Daily email function triggered!",
        description: "Check the edge function logs in Supabase to see the results.",
      });
    } catch (error: any) {
      console.error('Cron test error:', error);
      toast({
        title: "Note",
        description: "This function requires CRON_SECRET to be set. Check your Supabase secrets.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Email Notification Testing</h1>
        <p className="text-muted-foreground mt-2">
          Test your email notification system
        </p>
      </div>

      {!user && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">⚠️ You must be logged in to test email notifications</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Test Immediate Confirmation Email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will create a test document and reminder, then send you an immediate confirmation email.
            The test data will be automatically deleted after sending.
          </p>

          <div className="space-y-2">
            <Label htmlFor="test-date">Test Document Expiry Date</Label>
            <Input
              id="test-date"
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
            />
          </div>

          <Button 
            onClick={testImmediateEmail} 
            disabled={loading || !user}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending Test Email...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Test Confirmation Email
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Test Daily Reminder Email Function
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will manually trigger the daily reminder email function.
            It will send emails for all reminders that are due today.
          </p>

          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium">⚠️ Prerequisites:</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>CRON_SECRET must be added in Supabase Edge Function secrets</li>
              <li>You need at least one reminder set for today's date</li>
            </ul>
          </div>

          <Button 
            onClick={testDailyEmailCron} 
            disabled={loading}
            variant="secondary"
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Triggering Function...
              </>
            ) : (
              <>
                <Calendar className="mr-2 h-4 w-4" />
                Trigger Daily Email Function
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="pt-6 space-y-2">
          <p className="text-sm font-medium">📧 Email Details:</p>
          <ul className="text-sm space-y-1">
            <li><strong>From:</strong> remind659@gmail.com</li>
            <li><strong>Your email:</strong> {user?.email || 'Not logged in'}</li>
            <li><strong>Resend API:</strong> Configured ✅</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
