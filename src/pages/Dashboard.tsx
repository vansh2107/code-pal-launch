import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Camera, Bell, ShieldCheck, User, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getSignedUrl } from "@/utils/signedUrl";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DocumentStats } from "@/components/dashboard/DocumentStats";
import { ExpiryTimeline } from "@/components/dashboard/ExpiryTimeline";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getDocumentStatus } from "@/utils/documentStatus";
import { sendTestNotification } from "@/utils/notifications";
import { cn } from "@/lib/utils";

interface Document {
  id: string;
  name: string;
  document_type: string;
  expiry_date: string;
  created_at: string;
  issuing_authority?: string;
  user_id: string;
}

// ── Skeleton for instant visual feedback ──
function DashboardSkeleton() {
  return (
    <AppShell>
      <PageHeader
        title={<Skeleton className="h-8 w-40" />}
        description={<Skeleton className="h-4 w-64" />}
        variant="sticky"
      />
      <div className="space-y-6 pb-6 pt-4">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-20 rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-[14px]" />
        <Skeleton className="h-12 rounded-[12px]" />
        <Skeleton className="h-40 rounded-[14px]" />
      </div>
    </AppShell>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Log first meaningful paint
  useEffect(() => {
    performance.mark('dashboard-mount');
    if (performance.getEntriesByName('app-init-start').length) {
      performance.measure('app-to-dashboard', 'app-init-start', 'dashboard-mount');
      const measure = performance.getEntriesByName('app-to-dashboard').pop();
      if (measure) {
        console.log(`⚡ App → Dashboard: ${Math.round(measure.duration)}ms`);
      }
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
      fetchAvatar();
    }
  }, [user]);

  const fetchAvatar = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.avatar_url) {
      if (data.avatar_url.startsWith("http")) {
        setAvatarUrl(data.avatar_url);
      } else {
        const signed = await getSignedUrl("document-images", data.avatar_url);
        if (signed) setAvatarUrl(signed);
      }
    }
  };

  const fetchDashboardData = async () => {
    try {
      // Only select needed fields, not '*'
      const { data, error } = await supabase
        .from('documents')
        .select('id, name, document_type, expiry_date, created_at, issuing_authority, user_id')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Compute stats and filtered views from documents (memoized)
  const { stats, recentDocuments, nonDocVaultDocs, attentionDocuments } = useMemo(() => {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const nonDocVault = documents.filter(doc => doc.issuing_authority !== 'DocVault');
    
    const total = nonDocVault.length;
    const expired = nonDocVault.filter(doc => new Date(doc.expiry_date) < today).length;
    const expiringSoon = nonDocVault.filter(doc => {
      const expiryDate = new Date(doc.expiry_date);
      return expiryDate >= today && expiryDate <= thirtyDaysFromNow;
    }).length;

    const attention = nonDocVault
      .filter(doc => new Date(doc.expiry_date) <= thirtyDaysFromNow)
      .sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

    return {
      stats: { total, expiringSoon, expired, valid: total - expired - expiringSoon },
      recentDocuments: documents.slice(0, 3),
      nonDocVaultDocs: nonDocVault,
      attentionDocuments: attention,
    };
  }, [documents]);

  const handleTestNotification = async () => {
    setSendingTest(true);
    try {
      const success = await sendTestNotification();
      toast({
        title: success ? "Test notification sent! 📲" : "Failed to send test notification",
        description: success 
          ? "Check your device for the push notification."
          : "Please make sure notifications are enabled in settings.",
        variant: success ? "default" : "destructive",
      });
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast({ title: "Error sending test notification", variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  const profileAvatar = (
    <Link to="/profile" aria-label="Open profile" className="shrink-0 block">
      <Avatar className="h-10 w-10 ring-1 ring-border hover:ring-primary/40 smooth md:h-11 md:w-11">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="Profile" />}
        <AvatarFallback className="bg-primary/10">
          <User className="h-5 w-5 text-primary" />
        </AvatarFallback>
      </Avatar>
    </Link>
  );

  // Show skeleton immediately — no blank screen
  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's your document overview."
        trailing={profileAvatar}
        variant="sticky"
      />

      <div className="space-y-6 pb-6">
        <div className="animate-slide-up">
          <DocumentStats
            total={stats.total}
            expiringSoon={stats.expiringSoon}
            expired={stats.expired}
            valid={stats.valid}
          />
        </div>

        <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <ExpiryTimeline documents={nonDocVaultDocs} />
        </div>

        <div className="animate-fade-in space-y-3" style={{ animationDelay: '0.2s' }}>
          <Link to="/scan">
            <Button className="w-full btn-glow" size="lg">
              <Camera className="h-5 w-5 mr-2" />
              Scan New Document
            </Button>
          </Link>
          
          <Button 
            onClick={handleTestNotification} 
            disabled={sendingTest}
            variant="outline"
            className="w-full border-2 hover:bg-primary/5 hover:border-primary"
            size="lg"
          >
            <Bell className="h-5 w-5 mr-2" />
            {sendingTest ? "Sending Test..." : "Test Push Notification"}
          </Button>
        </div>

        <div className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <Card>
            <CardHeader>
              <CardTitle>Recent Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {recentDocuments.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-float" />
                  <p className="text-muted-foreground font-medium">No documents yet</p>
                  <p className="text-sm text-muted-foreground mt-2">Add your first document to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentDocuments.map((doc, index) => {
                    const isDocVault = doc.issuing_authority === 'DocVault';
                    const statusInfo = getDocumentStatus(doc.expiry_date);
                    return (
                      <Link
                        key={doc.id}
                        to={`/documents/${doc.id}`}
                        className={`block p-4 rounded-[14px] smooth hover:shadow-lg border-2 ${statusInfo.bgClass} ${statusInfo.borderClass}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1 text-foreground">{doc.name}</h3>
                            <p className="text-sm text-secondary-foreground capitalize">
                              {isDocVault
                                ? `Added ${new Date(doc.created_at).toLocaleDateString()}`
                                : `${doc.document_type.replace('_', ' ')} • Expires ${new Date(doc.expiry_date).toLocaleDateString()}`}
                            </p>
                          </div>
                          {!isDocVault && (
                            <Badge variant={statusInfo.badgeVariant} className={statusInfo.colorClass}>
                              {statusInfo.label}
                            </Badge>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
