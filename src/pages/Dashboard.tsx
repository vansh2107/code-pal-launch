import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Camera, Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { DocumentStats } from "@/components/dashboard/DocumentStats";
import { ExpiryTimeline } from "@/components/dashboard/ExpiryTimeline";
import { ChatBot } from "@/components/chatbot/ChatBot";
import { useToast } from "@/hooks/use-toast";

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
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

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

  const sendTestNotification = async () => {
    setSendingTest(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Not Authenticated",
          description: "Please log in to send test notifications",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('test-push-notification', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      
      if (error) throw error;
      
      toast({
        title: "Test Notification Sent!",
        description: "Check your device for the notification.",
      });
    } catch (error: any) {
      console.error('Error sending test notification:', error);
      toast({
        title: "Failed to Send",
        description: error.message || "Could not send test notification",
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
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-b border-border/50 px-4 py-8 animate-fade-in">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gradient mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your document overview.</p>
        </div>
      </header>

      <main className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
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
            className="w-full" 
            size="lg" 
            variant="outline"
            onClick={sendTestNotification}
            disabled={sendingTest}
          >
            <Bell className="h-5 w-5 mr-2" />
            {sendingTest ? "Sending..." : "Send Test Notification"}
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
                    return (
                      <Link
                        key={doc.id}
                        to={`/document/${doc.id}`}
                        className="block p-4 border border-border rounded-xl hover:border-primary/50 smooth hover:shadow-lg"
                        style={{ animationDelay: `${0.1 * index}s` }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-foreground mb-1">{doc.name}</h3>
                            <p className="text-sm text-muted-foreground capitalize">
                              {isDocVault ? (
                                `Added ${new Date(doc.created_at).toLocaleDateString()}`
                              ) : (
                                `${doc.document_type.replace('_', ' ')} • Expires ${new Date(doc.expiry_date).toLocaleDateString()}`
                              )}
                            </p>
                          </div>
                          {!isDocVault && getStatusBadge(doc.expiry_date)}
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
  );
}