import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Camera, Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { SafeAreaContainer } from "@/components/layout/SafeAreaContainer";
import { DocumentStats } from "@/components/dashboard/DocumentStats";
import { ExpiryTimeline } from "@/components/dashboard/ExpiryTimeline";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getDocumentStatus } from "@/utils/documentStatus";
import { sendTestNotification } from "@/utils/notifications";

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
    <SafeAreaContainer>
      <div className="min-h-screen page-bg flex flex-col w-full" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
        <header className="bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 py-4">
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-64" />
        </header>
        <main className="flex-1 px-4 py-6 space-y-6 w-full max-w-4xl mx-auto">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </main>
        <BottomNavigation />
      </div>
    </SafeAreaContainer>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);

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
    if (user) fetchDashboardData();
  }, [user]);

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

  // Compute stats from documents (memoized)
  const { stats, recentDocuments, nonDocVaultDocs } = useMemo(() => {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const nonDocVault = documents.filter(doc => doc.issuing_authority !== 'DocVault');
    
    const total = nonDocVault.length;
    const expired = nonDocVault.filter(doc => new Date(doc.expiry_date) < today).length;
    const expiringSoon = nonDocVault.filter(doc => {
      const expiryDate = new Date(doc.expiry_date);
      return expiryDate >= today && expiryDate <= thirtyDaysFromNow;
    }).length;

    return {
      stats: { total, expiringSoon, expired, valid: total - expired - expiringSoon },
      recentDocuments: documents.slice(0, 3),
      nonDocVaultDocs: nonDocVault,
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

  // Show skeleton immediately — no blank screen
  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <SafeAreaContainer>
      <div 
        className="min-h-screen page-bg flex flex-col w-full overflow-x-hidden" 
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        <header className="bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 py-4">
          <div className="w-full max-w-4xl mx-auto">
            <h1 className="text-2xl font-semibold text-gradient mb-1">Dashboard</h1>
            <p className="text-base text-muted-foreground">Welcome back! Here's your document overview.</p>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 space-y-6 w-full max-w-4xl mx-auto overflow-x-hidden">
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
                          className={`block p-4 rounded-xl smooth hover:shadow-lg border-2 ${statusInfo.bgClass} ${statusInfo.borderClass}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h3 className={`font-semibold mb-1 ${statusInfo.textClass}`}>{doc.name}</h3>
                              <p className="text-sm text-muted-foreground capitalize">
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
        </main>

        <BottomNavigation />
      </div>
    </SafeAreaContainer>
  );
}
