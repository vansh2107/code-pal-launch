import { useState, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface AIRecommendationsProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    consecutive_missed_days: number;
  };
}

export function AIRecommendations({ task }: AIRecommendationsProps) {
  const [recommendation, setRecommendation] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (task.status === "pending") {
      fetchRecommendation();
    }
  }, [task.id]);

  const fetchRecommendation = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("task-ai-recommendations", {
        body: {
          taskTitle: task.title,
          taskDescription: task.description,
          missedDays: task.consecutive_missed_days,
          status: task.status,
        },
      });

      if (error) throw error;
      setRecommendation(data.recommendation);
    } catch (error) {
      console.error("Error fetching AI recommendation:", error);
    } finally {
      setLoading(false);
    }
  };

  if (task.status !== "pending" || (!loading && !recommendation)) {
    return null;
  }

  return (
    <Card className="mt-3 p-3 bg-background/50 border-primary/20">
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-primary mb-1">AI Suggestion</p>
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Generating tips...</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {recommendation}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
