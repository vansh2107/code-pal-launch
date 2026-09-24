/**
 * src/pages/Notifications.tsx — Firestore reminders list page
 * Replaces Supabase join query with Firestore reminders + documents reads. UI unchanged.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, FileText, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  collection,
  getDocs,
  query,
  orderBy,
  getDoc,
  doc,
} from "firebase/firestore";
import { firebaseDb } from "@/integrations/firebase/client";

interface NotificationData {
  id:            string;
  document_id:   string;
  reminder_date: string;
  is_sent:       boolean;
  document: {
    name:          string;
    document_type: string;
    expiry_date:   string;
  };
}

export default function Notifications() {
  const { user }                                    = useAuth();
  const [notifications, setNotifications]           = useState<NotificationData[]>([]);
  const [loading,       setLoading]                 = useState(true);

  useEffect(() => { if (user) fetchNotifications(); }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const remSnap = await getDocs(
        query(
          collection(firebaseDb, `users/${user.uid}/reminders`),
          orderBy("reminderDate", "asc"),
        ),
      );

      // Fetch each parent document in parallel (deduplicated by docId)
      const docIds = [...new Set(remSnap.docs.map((d) => d.data().documentId as string))];
      const docMap: Record<string, { name: string; document_type: string; expiry_date: string }> = {};
      await Promise.all(
        docIds.map(async (docId) => {
          try {
            const docSnap = await getDoc(doc(firebaseDb, `users/${user.uid}/documents/${docId}`));
            if (docSnap.exists()) {
              const d = docSnap.data();
              docMap[docId] = {
                name:          d.name          as string,
                document_type: d.documentType  as string,
                expiry_date:   (d.expiryDate   as string) ?? '',
              };
            }
          } catch { /* skip missing docs */ }
        }),
      );

      const transformed: NotificationData[] = remSnap.docs
        .map((d) => {
          const data     = d.data();
          const docId    = data.documentId as string;
          const document = docMap[docId];
          if (!document) return null;
          return {
            id:            d.id,
            document_id:   docId,
            reminder_date: data.reminderDate as string,
            is_sent:       (data.isSent as boolean) ?? false,
            document,
          };
        })
        .filter(Boolean) as NotificationData[];

      setNotifications(transformed);
    } catch (error) {
      console.error('[Notifications] fetchNotifications error:', error);
      toast({ title: "Error loading notifications", description: "Please check your connection and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getNotificationStatus = (reminderDate: string, expiryDate: string) => {
    const today    = new Date();
    const reminder = new Date(reminderDate);
    const expiry   = new Date(expiryDate);
    if (expiry < today)   return { status: "expired", color: "destructive", text: "Document Expired" };
    if (reminder <= today) return { status: "active",  color: "warning",     text: "Renewal Due Soon" };
    return                        { status: "pending", color: "secondary",   text: "Upcoming Reminder" };
  };

  const groupNotificationsByStatus = (ns: NotificationData[]) => {
    const active   = ns.filter(n => ["active","expired"].includes( getNotificationStatus(n.reminder_date, n.document.expiry_date).status));
    const upcoming = ns.filter(n => getNotificationStatus(n.reminder_date, n.document.expiry_date).status === "pending");
    return { active, upcoming };
  };

  if (loading) {
    return (
      <AppShell>
        <PageHeader title={<Skeleton className="h-8 w-44" />} description={<Skeleton className="h-4 w-64" />} variant="sticky" />
        <div className="space-y-6 pb-6"><div className="space-y-3">{[1,2,3].map(i=><Skeleton key={i} className="h-20 rounded-[14px]"/>)}</div></div>
      </AppShell>
    );
  }

  const { active, upcoming } = groupNotificationsByStatus(notifications);
  const addAction = notifications.length === 0
    ? <Link to="/scan"><Button size="sm"><FileText className="h-4 w-4 mr-2" />Add Document</Button></Link>
    : null;

  return (
    <AppShell>
      <PageHeader title="Notifications" description="Stay on top of your document renewals" action={addAction} variant="sticky" />
      <div className="space-y-6 pb-6">
        {active.length > 0 && (
          <div>
            <h2 className="text-[18px] leading-[26px] font-semibold mb-3 flex items-center gap-2 tracking-tight">
              <Bell className="h-5 w-5 text-warning" />Action Required ({active.length})
            </h2>
            <div className="space-y-3">
              {active.map((n) => {
                const status = getNotificationStatus(n.reminder_date, n.document.expiry_date);
                return (
                  <Link key={n.id} to={`/documents/${n.document_id}`}>
                    <Card className="w-full rounded-[16px] hover:bg-muted/50 transition-colors shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-foreground mb-1">{n.document.name}</h3>
                            <p className="text-sm text-muted-foreground capitalize mb-2">{n.document.document_type.replace('_', ' ')}</p>
                            <p className="text-sm text-muted-foreground">Expires: {new Date(n.document.expiry_date).toLocaleDateString()}</p>
                          </div>
                          <div className="ml-4">
                            <Badge variant={status.color === "destructive" ? "destructive" : "secondary"} className={status.color === "warning" ? "bg-warning text-warning-foreground" : ""}>{status.text}</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div>
            <h2 className="text-[18px] leading-[26px] font-semibold mb-3 flex items-center gap-2 tracking-tight">
              <Calendar className="h-5 w-5 text-muted-foreground" />Upcoming Reminders ({upcoming.length})
            </h2>
            <div className="space-y-3">
              {upcoming.map((n) => (
                <Link key={n.id} to={`/documents/${n.document_id}`}>
                  <Card className="w-full rounded-[16px] hover:bg-muted/50 transition-colors shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-1">{n.document.name}</h3>
                          <p className="text-sm text-muted-foreground capitalize mb-2">{n.document.document_type.replace('_', ' ')}</p>
                          <p className="text-sm text-muted-foreground">Reminder: {new Date(n.reminder_date).toLocaleDateString()}</p>
                        </div>
                        <div className="ml-4"><Badge variant="secondary">Upcoming</Badge></div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {notifications.length === 0 && (
          <div className="text-center py-12">
            <Bell className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
            <h2 className="text-xl font-semibold mb-2">No notifications yet</h2>
            <p className="text-muted-foreground mb-6">Add some documents to start receiving renewal reminders</p>
            <Link to="/scan"><Button><FileText className="h-4 w-4 mr-2" />Add Your First Document</Button></Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
