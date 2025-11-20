import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

interface HistoryEntry {
  id: string;
  action: string;
  old_expiry_date: string | null;
  new_expiry_date: string | null;
  notes: string | null;
  created_at: string;
}

interface DocumentHistoryProps {
  documentId: string;
}

export function DocumentHistory({ documentId }: DocumentHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [documentId]);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("document_history")
        .select("*")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "created":
        return <Badge variant="secondary" className="bg-accent text-accent-foreground">Created</Badge>;
      case "renewed":
        return <Badge variant="secondary" className="bg-primary text-primary-foreground">Renewed</Badge>;
      case "updated":
        return <Badge variant="outline">Updated</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Document History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Document History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No history available
          </p>
        ) : (
          <div className="space-y-4">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getActionBadge(entry.action)}
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString()} at{" "}
                      {new Date(entry.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {entry.notes && (
                    <p className="text-sm text-muted-foreground mb-1">{entry.notes}</p>
                  )}
                  {entry.old_expiry_date && entry.new_expiry_date && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Expiry changed from </span>
                      <span className="font-medium">
                        {new Date(entry.old_expiry_date).toLocaleDateString()}
                      </span>
                      <span className="text-muted-foreground"> to </span>
                      <span className="font-medium">
                        {new Date(entry.new_expiry_date).toLocaleDateString()}
                      </span>
                    </p>
                  )}
                  {entry.new_expiry_date && !entry.old_expiry_date && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Set expiry date to </span>
                      <span className="font-medium">
                        {new Date(entry.new_expiry_date).toLocaleDateString()}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
