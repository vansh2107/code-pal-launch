import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, FileText, Bell, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  document_id: string | null;
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, created_at, document_id")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case "document":
        return <FileText className="h-4 w-4" />;
      case "reminder":
        return <Bell className="h-4 w-4" />;
      case "profile":
        return <User className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "create":
        return "bg-accent text-accent-foreground";
      case "update":
        return "bg-primary text-primary-foreground";
      case "delete":
        return "bg-destructive text-destructive-foreground";
      case "view":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Activity Log
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
          <Shield className="h-5 w-5" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No activity yet
          </p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="mt-0.5">{getEntityIcon(log.entity_type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="secondary"
                        className={getActionColor(log.action)}
                      >
                        {log.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground capitalize">
                        {log.entity_type}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleDateString()} at{" "}
                      {new Date(log.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
