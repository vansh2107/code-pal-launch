import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Camera } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { DocumentStats } from "@/components/dashboard/DocumentStats";

import { ExpiryTimeline } from "@/components/dashboard/ExpiryTimeline";

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
  const [stats, setStats] = useState<DashboardStats>({ total: 0, expiringSoon: 0, expired: 0, valid: 0 });
  const [documents, setDocuments] = useState<Document[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<Document[]>([]);
  const [timelineData, setTimelineData] = useState<Array<{ month: string; expiring: number }>>([]);
  const [loading, setLoading] = useState(true);

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

      const total = documents?.length || 0;
      const expired = documents?.filter(doc => new Date(doc.expiry_date) < today).length || 0;
      const expiringSoon = documents?.filter(doc => {
        const expiryDate = new Date(doc.expiry_date);
        return expiryDate >= today && expiryDate <= thirtyDaysFromNow;
      }).length || 0;
      const valid = total - expired - expiringSoon;

      setStats({ total, expiringSoon, expired, valid });
      setDocuments(documents || []);
      setRecentDocuments(documents?.slice(0, 3) || []);

      // Calculate expiry timeline (next 6 months)
      const monthCounts: Record<string, number> = {};
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      for (let i = 0; i < 6; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() + i);
        const monthKey = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
        monthCounts[monthKey] = 0;
      }

      documents?.forEach(doc => {
        const expiryDate = new Date(doc.expiry_date);
        const monthKey = `${monthNames[expiryDate.getMonth()]} ${expiryDate.getFullYear()}`;
        
        if (monthCounts.hasOwnProperty(monthKey)) {
          monthCounts[monthKey]++;
        }
      });

      setTimelineData(
        Object.entries(monthCounts).map(([month, expiring]) => ({
          month,
          expiring,
        }))
      );
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
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
          <ExpiryTimeline data={timelineData} documents={documents} />
        </div>

        {/* Quick Action */}
        <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <Link to="/scan">
            <Button className="w-full btn-glow" size="lg">
              <Camera className="h-5 w-5 mr-2" />
              Scan New Document
            </Button>
          </Link>
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
                  {recentDocuments.map((doc, index) => (
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
                            {doc.document_type.replace('_', ' ')} • Expires {new Date(doc.expiry_date).toLocaleDateString()}
                          </p>
                        </div>
                        {getStatusBadge(doc.expiry_date)}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
}