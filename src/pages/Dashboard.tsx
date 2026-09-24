/**
 * src/pages/Dashboard.tsx — Firestore dashboard page
 * Replaces Supabase with Firestore. UI unchanged.
 */

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Camera, Bell, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getSignedUrl } from '@/utils/signedUrl';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { DocumentStats } from '@/components/dashboard/DocumentStats';
import { ExpiryTimeline } from '@/components/dashboard/ExpiryTimeline';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getDocumentStatus } from '@/utils/documentStatus';
import { sendTestNotification } from '@/utils/notifications';
import { isValidCalendarDate } from '@/utils/documentDecisionEngine';
import { collection, query, orderBy, limit, getDocs, getDoc, onSnapshot } from 'firebase/firestore';
import { firebaseDb } from '@/integrations/firebase/client';
import { userProfileDoc } from '@/integrations/firebase/firestore';

interface Document {
  id: string;
  name: string;
  document_type: string;
  expiry_date: string;
  created_at: string;
  issuing_authority?: string;
  user_id: string;
}

function DashboardSkeleton() {
  return (
    <AppShell>
      <PageHeader title={<Skeleton className="h-8 w-40" />} description={<Skeleton className="h-4 w-64" />} variant="sticky" />
      <div className="space-y-6 pb-6 pt-4">
        <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-[14px]" />)}</div>
        <Skeleton className="h-48 rounded-[14px]" />
        <Skeleton className="h-12 rounded-[12px]" />
        <Skeleton className="h-40 rounded-[14px]" />
      </div>
    </AppShell>
  );
}

export default function Dashboard() {
  const { user }     = useAuth();
  const { toast }    = useToast();
  const [documents,  setDocuments]  = useState<Document[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [sendingTest, setSendingTest] = useState(false);
  const [avatarUrl,  setAvatarUrl]  = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchAvatar();

    // Real-time listener on documents collection
    const uid  = user.uid;
    const colRef = collection(firebaseDb, `users/${uid}/documents`);
    const q    = query(colRef, orderBy('createdAt', 'desc'), limit(200));
    const unsub = onSnapshot(q, (snap) => {
      const docs: Document[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id:                d.id,
          name:              data.name              as string,
          document_type:     data.documentType      as string,
          expiry_date:       (data.expiryDate        as string) ?? '',
          created_at:        data.createdAt          as string,
          issuing_authority: (data.issuingAuthority  as string | undefined),
          user_id:           uid,
        };
      });
      setDocuments(docs);
      setLoading(false);
    }, (err) => {
      console.error('[Dashboard] onSnapshot error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const fetchAvatar = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(userProfileDoc(user.uid));
      const avatarPath = snap.data()?.avatarUrl as string | null | undefined;
      if (!avatarPath) return;
      if (avatarPath.startsWith('http')) {
        setAvatarUrl(avatarPath);
      } else {
        const signed = await getSignedUrl('document-images', avatarPath);
        if (signed) setAvatarUrl(signed);
      }
    } catch (err) { console.error('[Dashboard] fetchAvatar:', err); }
  };

  const { stats, recentDocuments, nonDocVaultDocs } = useMemo(() => {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const nonDocVault = documents.filter(doc => doc.issuing_authority !== 'DocVault');
    const docsWithExpiry = nonDocVault.filter(doc => doc.expiry_date && isValidCalendarDate(doc.expiry_date));
    const total        = docsWithExpiry.length;
    const expired      = docsWithExpiry.filter(doc => new Date(doc.expiry_date) < today).length;
    const expiringSoon = docsWithExpiry.filter(doc => {
      const e = new Date(doc.expiry_date);
      return e >= today && e <= thirtyDaysFromNow;
    }).length;
    return {
      stats: { total, expiringSoon, expired, valid: total - expired - expiringSoon },
      recentDocuments:  documents.slice(0, 3),
      nonDocVaultDocs:  docsWithExpiry,
    };
  }, [documents]);

  const handleTestNotification = async () => {
    setSendingTest(true);
    try {
      const result = await sendTestNotification();
      toast({ title: result.ok ? 'Test notification sent! 📲' : "Couldn't send test notification", description: result.message, variant: result.ok ? 'default' : 'destructive' });
    } catch { toast({ title: 'Error sending test notification', variant: 'destructive' }); }
    finally { setSendingTest(false); }
  };

  const profileAvatar = (
    <Link to="/profile" aria-label="Open profile" className="shrink-0 block">
      <Avatar className="h-10 w-10 ring-1 ring-border hover:ring-primary/40 smooth md:h-11 md:w-11">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="Profile" />}
        <AvatarFallback className="bg-primary/10"><User className="h-5 w-5 text-primary" /></AvatarFallback>
      </Avatar>
    </Link>
  );

  if (loading) return <DashboardSkeleton />;

  return (
    <AppShell>
      <PageHeader title="Dashboard" description="Welcome back! Here's your document overview." trailing={profileAvatar} variant="sticky" />
      <div className="space-y-6 pb-6">
        <div className="animate-slide-up">
          <DocumentStats total={stats.total} expiringSoon={stats.expiringSoon} expired={stats.expired} valid={stats.valid} />
        </div>
        <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <ExpiryTimeline documents={nonDocVaultDocs} />
        </div>
        <div className="animate-fade-in space-y-3" style={{ animationDelay: '0.2s' }}>
          <Link to="/scan">
            <Button className="w-full btn-glow" size="lg"><Camera className="h-5 w-5 mr-2" />Scan New Document</Button>
          </Link>
          <Button onClick={handleTestNotification} disabled={sendingTest} variant="outline" className="w-full border-2 hover:bg-primary/5 hover:border-primary" size="lg">
            <Bell className="h-5 w-5 mr-2" />{sendingTest ? 'Sending Test...' : 'Test Push Notification'}
          </Button>
        </div>
        <div className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <Card>
            <CardHeader><CardTitle>Recent Documents</CardTitle></CardHeader>
            <CardContent>
              {recentDocuments.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-float" />
                  <p className="text-muted-foreground font-medium">No documents yet</p>
                  <p className="text-sm text-muted-foreground mt-2">Add your first document to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentDocuments.map((doc) => {
                    const isDocVault  = doc.issuing_authority === 'DocVault';
                    const statusInfo  = getDocumentStatus(doc.expiry_date);
                    return (
                      <Link key={doc.id} to={`/documents/${doc.id}`}
                        className={`block p-4 rounded-[14px] smooth hover:shadow-lg border-2 ${statusInfo.bgClass} ${statusInfo.borderClass}`}>
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
