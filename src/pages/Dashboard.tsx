import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Camera, Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { SafeAreaContainer } from "@/components/layout/SafeAreaContainer";
import { DocumentStats } from "@/components/dashboard/DocumentStats";
import { ExpiryTimeline } from "@/components/dashboard/ExpiryTimeline";
import { ChatBot } from "@/components/chatbot/ChatBot";
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

interface DashboardStats {
  total: number;
  expiringSoon: number;
  expired: number;
  valid: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats>({ total: 0, expiringSoon: 0, expired: 0, valid: 0 });
  const [documents, setDocuments] = useState<Document[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      // Fetch all documents for stats
      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const today = new Date();
      const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Filter out DocVault documents from stats
      const nonDocVaultDocs = documents?.filter(doc => doc.issuing_authority !== 'DocVault') || [];
      
      const total = nonDocVaultDocs.length;
      const expired = nonDocVaultDocs.filter(doc => new Date(doc.expiry_date) < today).length || 0;
      const expiringSoon = nonDocVaultDocs.filter(doc => {
        const expiryDate = new Date(doc.expiry_date);
        return expiryDate >= today && expiryDate <= thirtyDaysFromNow;
      }).length || 0;
      const valid = total - expired - expiringSoon;

      setStats({ total, expiringSoon, expired, valid });
      setDocuments(documents || []);
      setRecentDocuments(documents?.slice(0, 3) || []);

      // Removed expiry timeline calculation
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotification = async () => {
    setSendingTest(true);
    try {
      const success = await sendTestNotification();
      if (success) {
        toast({
          title: "Test notification sent! 📲",
          description: "Check your device for the push notification. Works for both Capacitor and Despia Native.",
        });
      } else {
        toast({
          title: "Failed to send test notification",
          description: "Please make sure notifications are enabled in settings.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast({
        title: "Error sending test notification",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingTest(false);
    }
  };

  const getStatusBadge = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (daysUntilExpiry <= 30) {
      return <Badge variant="secondary" className="bg-warning text-warning-foreground">Expiring Soon</Badge>;
    } else {
      return <Badge variant="secondary" className="bg-accent text-accent-foreground">Valid</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <SafeAreaContainer>
      <div 
        className="min-h-screen bg-background flex flex-col w-full overflow-x-hidden" 
        style={{ 
          paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' 
        }}
      >
        <header className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-b border-border/50 px-4 py-4">
          <div className="w-full max-w-4xl mx-auto">
            <h1 className="text-2xl font-semibold text-gradient mb-1">Dashboard</h1>
            <p className="text-base text-muted-foreground">Welcome back! Here's your document overview.</p>
          </div>
        </header>

      <main className="flex-1 px-4 py-6 space-y-6 w-full max-w-4xl mx-auto overflow-x-hidden">
        {/* Stats Cards */}
        <div className="animate-slide-up">
          <DocumentStats
            total={stats.total}
            expiringSoon={stats.expiringSoon}
            expired={stats.expired}
            valid={stats.valid}
          />
        </div>

        {/* Expiry Timeline */}
        <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <ExpiryTimeline documents={documents.filter(doc => doc.issuing_authority !== 'DocVault')} />
        </div>

        {/* Quick Actions */}
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

        {/* Recent Documents */}
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
                  <p className="text-sm text-muted-foreground mt-2">
                    Add your first document to get started
                  </p>
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
                        style={{ animationDelay: `${0.1 * index}s` }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className={`font-semibold mb-1 ${statusInfo.textClass}`}>{doc.name}</h3>
                            <p className="text-sm text-muted-foreground capitalize">
                              {isDocVault ? (
                                `Added ${new Date(doc.created_at).toLocaleDateString()}`
                              ) : (
                                `${doc.document_type.replace('_', ' ')} • Expires ${new Date(doc.expiry_date).toLocaleDateString()}`
                              )}
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

      <ChatBot />
      <BottomNavigation />
    </div>
    </SafeAreaContainer>
  );
}