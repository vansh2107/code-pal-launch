import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Calendar, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";

interface RenewalAdvisorProps {
  documentId?: string;
  documentType?: string;
  documentName?: string;
  expiryDate?: string;
}

export function RenewalAdvisor({ documentId, documentType, documentName, expiryDate }: RenewalAdvisorProps) {
  const [question, setQuestion] = useState("");
  const [advice, setAdvice] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const getAdvice = async (customQuestion?: string) => {
    setLoading(true);
    setAdvice("");

    try {
      const { data, error } = await supabase.functions.invoke('document-renewal-advisor', {
        body: {
          documentType,
          documentName,
          expiryDate,
          question: customQuestion || question
        }
      });

      if (error) {
        console.error('Function error:', error);
        throw error;
      }

      if (data.error) {
        if (data.error.includes("Rate limit")) {
          toast({
            title: "Rate limit exceeded",
            description: "Please wait a moment before trying again.",
            variant: "destructive",
          });
        } else if (data.error.includes("Payment required")) {
          toast({
            title: "Credits needed",
            description: "Please add credits to continue using AI features.",
            variant: "destructive",
          });
        } else {
          throw new Error(data.error);
        }
        return;
      }

      setAdvice(data.advice);
    } catch (error) {
      console.error('Error getting renewal advice:', error);
      toast({
        title: "Error",
        description: "Failed to get renewal advice. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-load renewal timeline on mount if document info is available
  useEffect(() => {
    if (documentType && expiryDate && !autoLoaded) {
      setAutoLoaded(true);
      getAdvice();
    }
  }, [documentType, expiryDate]);

  const extractRecommendedDays = (adviceText: string): number | null => {
    // Try multiple patterns to extract the number
    const patterns = [
      /Recommended renewal start:\s*(\d+)\s*days/i,
      /start.*?(\d+)\s*days\s*before/i,
      /(\d+)\s*days\s*before\s*expiry/i
    ];
    
    for (const pattern of patterns) {
      const match = adviceText.match(pattern);
      if (match) {
        console.log('Extracted days:', match[1], 'using pattern:', pattern);
        return parseInt(match[1]);
      }
    }
    
    console.log('Could not extract recommended days from:', adviceText.substring(0, 200));
    return null;
  };

  const calculateStartDate = (days: number): string => {
    if (!expiryDate) return '';
    const expiry = new Date(expiryDate);
    const startDate = new Date(expiry);
    startDate.setDate(startDate.getDate() - days);
    return startDate.toLocaleDateString();
  };

  const saveAIReminder = async () => {
    if (!recommendedDays || !expiryDate || !documentId || !user) return;
    
    setSavingReminder(true);
    try {
      const reminderDate = new Date(expiryDate);
      reminderDate.setDate(reminderDate.getDate() - recommendedDays);
      
      // Check if a similar reminder already exists
      const { data: existing } = await supabase
        .from('reminders')
        .select('id')
        .eq('document_id', documentId)
        .eq('reminder_date', reminderDate.toISOString().split('T')[0])
        .maybeSingle();
      
      if (existing) {
        toast({
          title: "Reminder already exists",
          description: "This AI recommendation is already saved as a reminder.",
        });
        return;
      }
      
      // Insert the AI-recommended reminder
      const { data: insertedReminder, error } = await supabase
        .from('reminders')
        .insert({
          document_id: documentId,
          user_id: user.id,
          reminder_date: reminderDate.toISOString().split('T')[0],
          is_custom: false,
          is_sent: false,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Send immediate confirmation email
      try {
        await supabase.functions.invoke('send-immediate-reminder', {
          body: { reminder_id: insertedReminder.id }
        });
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
        // Don't fail the whole operation if email fails
      }
      
      toast({
        title: "Reminder saved",
        description: `Notification will be sent ${recommendedDays} days before expiry. Check your email for confirmation.`,
      });
    } catch (error) {
      console.error('Error saving reminder:', error);
      toast({
        title: "Error",
        description: "Failed to save reminder. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingReminder(false);
    }
  };

  const quickQuestions = [
    "What documents do I need for renewal?",
    "How long does the renewal process take?",
    "What are the common renewal mistakes to avoid?",
    "Can I renew online?",
  ];

  const recommendedDays = advice ? extractRecommendedDays(advice) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Renewal Advisor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !advice ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-sm text-muted-foreground">Analyzing renewal timeline...</span>
          </div>
        ) : !advice ? (
          <>
            <p className="text-sm text-muted-foreground">
              Ask me anything about document renewal requirements
            </p>

            {/* Quick Questions */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Quick questions:</p>
              <div className="grid grid-cols-1 gap-2">
                {quickQuestions.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="justify-start text-left h-auto py-2 px-3"
                    onClick={() => getAdvice(q)}
                    disabled={loading}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Question */}
            <div className="space-y-2">
              <Textarea
                placeholder="Or type your own question..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
              />
              <Button 
                onClick={() => getAdvice()} 
                disabled={!question.trim() || loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Getting advice...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Ask AI
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Recommended Start Date Alert */}
            {recommendedDays && expiryDate && (
              <Alert className="border-primary/50 bg-primary/5">
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <strong>Start renewal process: {calculateStartDate(recommendedDays)}</strong>
                      <br />
                      <span className="text-sm text-muted-foreground">
                        ({recommendedDays} days before expiry)
                      </span>
                    </div>
                    {documentId && (
                      <Button 
                        size="sm" 
                        onClick={saveAIReminder}
                        disabled={savingReminder}
                      >
                        {savingReminder ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Bell className="h-4 w-4 mr-2" />
                            Set Reminder
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="prose prose-sm max-w-none">
              <div className="bg-muted/50 rounded-lg p-4 whitespace-pre-wrap text-sm">
                {advice}
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => {
                setAdvice("");
                setQuestion("");
                setAutoLoaded(false);
              }}
              className="w-full"
            >
              Ask Another Question
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
