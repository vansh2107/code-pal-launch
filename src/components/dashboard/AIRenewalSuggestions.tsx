import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Clock, AlertCircle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { differenceInDays } from "date-fns";

interface Document {
  id: string;
  name: string;
  document_type: string;
  expiry_date: string;
  issuing_authority?: string;
  user_id: string;
}

interface AIRenewalSuggestionsProps {
  documents: Document[];
}

interface AISuggestion {
  documentId: string;
  documentName: string;
  priority: "high" | "medium" | "low";
  suggestion: string;
  actionItems: string[];
}

export function AIRenewalSuggestions({ documents }: AIRenewalSuggestionsProps) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const { toast } = useToast();

  const getDocumentsNeedingRenewal = () => {
    const today = new Date();
    return documents.filter(doc => {
      const daysUntilExpiry = differenceInDays(new Date(doc.expiry_date), today);
      return daysUntilExpiry <= 90 && daysUntilExpiry >= -30; // Documents expiring within 90 days or expired within last 30 days
    });
  };

  const generateSuggestions = async () => {
    setLoading(true);
    try {
      const docsNeedingRenewal = getDocumentsNeedingRenewal();
      
      if (docsNeedingRenewal.length === 0) {
        toast({
          title: "All Set!",
          description: "No documents require immediate renewal attention.",
        });
        setSuggestions([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
        body: {
          documents: docsNeedingRenewal.map(doc => ({
            id: doc.id,
            name: doc.name,
            document_type: doc.document_type,
            expiry_date: doc.expiry_date,
            issuing_authority: doc.issuing_authority,
            daysUntilExpiry: differenceInDays(new Date(doc.expiry_date), new Date())
          })),
          analysisType: 'renewal_suggestions'
        }
      });

      if (error) throw error;

      setSuggestions(data.suggestions || []);
      toast({
        title: "AI Analysis Complete",
        description: `Generated renewal suggestions for ${data.suggestions?.length || 0} documents.`,
      });
    } catch (error: any) {
      console.error('Error generating AI suggestions:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate AI suggestions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const docsNeedingRenewal = getDocumentsNeedingRenewal();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-error";
      case "medium": return "text-warning";
      case "low": return "text-accent";
      default: return "text-muted-foreground";
    }
  };

  const getPriorityBg = (priority: string) => {
    switch (priority) {
      case "high": return "bg-error/10 border-error/20";
      case "medium": return "bg-warning/10 border-warning/20";
      case "low": return "bg-accent/10 border-accent/20";
      default: return "bg-muted/10";
    }
  };

  return (
    <Card className="glass-card border-white/10 hover-glow">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            AI Renewal Assistant
          </CardTitle>
          {docsNeedingRenewal.length > 0 && (
            <Button
              onClick={generateSuggestions}
              disabled={loading}
              size="sm"
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "Analyzing..." : "Get AI Suggestions"}
            </Button>
          )}
        </div>
        
        {docsNeedingRenewal.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{docsNeedingRenewal.length} document{docsNeedingRenewal.length !== 1 ? 's' : ''} need{docsNeedingRenewal.length === 1 ? 's' : ''} renewal attention</span>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {docsNeedingRenewal.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 mb-2">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <p className="text-sm text-muted-foreground">
              All documents are up to date! No renewals needed right now.
            </p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              Click "Get AI Suggestions" to receive personalized renewal guidance for your documents.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.documentId}
                className={`p-4 rounded-lg border ${getPriorityBg(suggestion.priority)} animate-fade-in`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-foreground">{suggestion.documentName}</h4>
                  <span className={`text-xs font-medium uppercase ${getPriorityColor(suggestion.priority)}`}>
                    {suggestion.priority} priority
                  </span>
                </div>
                
                <p className="text-sm text-muted-foreground mb-3">
                  {suggestion.suggestion}
                </p>
                
                {suggestion.actionItems && suggestion.actionItems.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground/80">Action Items:</p>
                    <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                      {suggestion.actionItems.map((item, idx) => (
                        <li key={idx} className="list-disc">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
