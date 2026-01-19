import { useState, useEffect, useRef, memo } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface LazyAIRecommendationsProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    consecutive_missed_days: number;
  };
}

// Cache recommendations per task to avoid refetching
const recommendationCache = new Map<string, string>();

function LazyAIRecommendationsComponent({ task }: LazyAIRecommendationsProps) {
  const [recommendation, setRecommendation] = useState<string>(() => 
    recommendationCache.get(task.id) || ""
  );
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef(!!recommendationCache.get(task.id));

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (task.status !== "pending") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px", threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [task.status]);

  // Fetch recommendation only when visible and not cached
  useEffect(() => {
    if (!isVisible || hasFetched.current || task.status !== "pending") return;
    
    hasFetched.current = true;
    
    const fetchRecommendation = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("task-ai-recommendations", {
          body: {
            title: task.title ?? "",
            description: task.description ?? "",
            missedDays: task.consecutive_missed_days,
            status: task.status,
          },
        });

        if (error) throw error;
        
        const rec = data.recommendation || "";
        recommendationCache.set(task.id, rec);
        setRecommendation(rec);
      } catch (error) {
        console.error("Error fetching AI recommendation:", error);
      } finally {
        setLoading(false);
      }
    };

    // Debounce the fetch slightly to avoid overwhelming the API
    const timeoutId = setTimeout(fetchRecommendation, 300);
    return () => clearTimeout(timeoutId);
  }, [isVisible, task.id, task.title, task.description, task.consecutive_missed_days, task.status]);

  // Don't render anything for non-pending tasks
  if (task.status !== "pending") {
    return null;
  }

  // Placeholder div for intersection observer
  if (!isVisible && !recommendation) {
    return <div ref={containerRef} className="h-1" aria-hidden="true" />;
  }

  // Don't show if no recommendation and not loading
  if (!loading && !recommendation) {
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

// Memoize to prevent unnecessary re-renders
export const LazyAIRecommendations = memo(LazyAIRecommendationsComponent, (prev, next) => {
  return (
    prev.task.id === next.task.id &&
    prev.task.status === next.task.status &&
    prev.task.consecutive_missed_days === next.task.consecutive_missed_days
  );
});
