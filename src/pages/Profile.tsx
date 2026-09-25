/**
 * src/pages/Profile.tsx — Firestore profile page
 * Replaces Supabase with Firestore. UI unchanged.
 */

import React, { useEffect, useState } from 'react';
import { ChevronRight, Download, User, LogOut, HelpCircle, MessageSquare, Info, Mail, FileCheck, Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { toast } from '@/hooks/use-toast';
import { useNavigate, Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FeedbackDialog } from '@/components/feedback/FeedbackDialog';
import { exportToCSV, exportToJSON } from '@/utils/exportData';
import { getSignedUrl } from '@/utils/signedUrl';
import { AvatarEditPopover } from '@/components/profile/AvatarEditPopover';
import { EditProfileSheet } from '@/components/profile/EditProfileSheet';
import { AppearanceSettings } from '@/components/theme/AppearanceSettings';
import { getDoc, getDocs, collection } from 'firebase/firestore';
import { firebaseDb } from '@/integrations/firebase/client';
import { userProfileDoc } from '@/integrations/firebase/firestore';

interface Profile { id?: string; display_name: string | null; country: string | null; phone_number: string | null; avatar_url?: string | null; }

interface SettingsItemProps { icon: React.ElementType; title: string; onClick?: () => void; to?: string; }
function SettingsItem({ icon: Icon, title, onClick, to }: SettingsItemProps) {
  const content = (
    <div className="flex items-center justify-between p-4 hover:bg-accent/5 smooth cursor-pointer group">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <span className="text-foreground font-medium">{title}</span>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 smooth" />
    </div>
  );
  if (to) return <Link to={to} className="block border-b border-border/50 last:border-0">{content}</Link>;
  return <button onClick={onClick} className="w-full text-left border-b border-border/50 last:border-0">{content}</button>;
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 animate-fade-in w-full">
      <h2 className="text-xl font-semibold text-foreground mb-3 px-1">{title}</h2>
      <div className="w-full bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">{children}</div>
    </div>
  );
}

export default function Profile() {
  const { user, signOut }  = useAuth();
  const navigate            = useNavigate();
  const [profile,           setProfile]           = useState<Profile | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [avatarSignedUrl,   setAvatarSignedUrl]   = useState<string | null>(null);
  const [editProfileOpen,   setEditProfileOpen]   = useState(false);

  useEffect(() => { if (user) fetchProfile(); }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(userProfileDoc(user.uid));
      if (snap.exists()) {
        const data = snap.data();
        const p: Profile = {
          display_name: (data.displayName as string | null) ?? null,
          country:      (data.country     as string | null) ?? null,
          phone_number: (data.phoneNumber as string | null) ?? null,
          avatar_url:   (data.avatarUrl   as string | null) ?? null,
        };
        setProfile(p);
        if (p.avatar_url) {
          if (p.avatar_url.startsWith('http')) {
            setAvatarSignedUrl(p.avatar_url);
          } else {
            const url = await getSignedUrl('document-images', p.avatar_url);
            if (url) setAvatarSignedUrl(url);
          }
        } else {
          setAvatarSignedUrl(null);
        }
      }
    } catch (err) { console.error('[Profile] fetchProfile:', err); }
    finally { setLoading(false); }
  };

  const handleSignOut = async () => {
    try { await signOut(); navigate('/auth'); }
    catch { toast({ title: 'Error', description: 'Failed to sign out', variant: 'destructive' }); }
  };

  const handleExportCSV = async () => {
    if (!user) return;
    try {
      const snap = await getDocs(collection(firebaseDb, `users/${user.uid}/documents`));
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      exportToCSV(docs as never);
      toast({ title: 'Export successful', description: 'Your documents have been exported to CSV' });
    } catch { toast({ title: 'Export failed', description: 'Could not export documents', variant: 'destructive' }); }
  };

  const handleExportJSON = async () => {
    if (!user) return;
    try {
      const snap = await getDocs(collection(firebaseDb, `users/${user.uid}/documents`));
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      exportToJSON(docs as never);
      toast({ title: 'Export successful', description: 'Your documents have been exported to JSON' });
    } catch { toast({ title: 'Export failed', description: 'Could not export documents', variant: 'destructive' }); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <AppShell contentWidth="full">
      <div className="w-full flex flex-col">
        <header className="bg-card border-b border-border/50 -mx-4 md:-mx-6 px-4 md:px-6 py-4 sticky top-0 z-10">
          <div className="w-full flex items-center gap-3">
            <div className="relative shrink-0 w-14 h-14 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
              {avatarSignedUrl
                ? <img src={avatarSignedUrl} alt="Profile" className="w-full h-full object-cover" />
                : <User className="h-7 w-7 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">
                {profile?.display_name ?? user?.email?.split('@')[0] ?? 'User'}
              </h1>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 py-6 w-full max-w-full overflow-x-hidden">
          <SettingsSection title="Account">
            <SettingsItem icon={User} title="Edit Profile" onClick={() => setEditProfileOpen(true)} />
          </SettingsSection>

          <SettingsSection title="Documents">
            <Dialog>
              <DialogTrigger asChild><button className="w-full"><SettingsItem icon={Download} title="Export Data" /></button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Export Your Documents</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-4">
                  <Button onClick={handleExportCSV} className="w-full" variant="outline"><FileCheck className="h-4 w-4 mr-2" />Export as CSV</Button>
                  <Button onClick={handleExportJSON} className="w-full" variant="outline"><FileCheck className="h-4 w-4 mr-2" />Export as JSON</Button>
                </div>
              </DialogContent>
            </Dialog>
          </SettingsSection>

          <SettingsSection title="Notifications">
            <SettingsItem icon={Bell} title="Notification Settings" to="/notification-sound-settings" />
          </SettingsSection>

          <SettingsSection title="Appearance"><AppearanceSettings /></SettingsSection>

          <SettingsSection title="Support">
            <Dialog>
              <DialogTrigger asChild><button className="w-full"><SettingsItem icon={HelpCircle} title="Help Center" /></button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Help Center</DialogTitle></DialogHeader>
                <div className="pt-4 space-y-4">
                  <div><h3 className="font-semibold mb-2">How to scan documents?</h3><p className="text-sm text-muted-foreground">Tap Scan, allow camera access, and position your document in the frame.</p></div>
                  <div><h3 className="font-semibold mb-2">Need more help?</h3><p className="text-sm text-muted-foreground">Contact us at remind659@gmail.com</p></div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild><button className="w-full"><SettingsItem icon={MessageSquare} title="Send Feedback" /></button></DialogTrigger>
              <DialogContent><DialogHeader><DialogTitle>Send Feedback</DialogTitle></DialogHeader><div className="pt-4"><FeedbackDialog /></div></DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild><button className="w-full"><SettingsItem icon={Mail} title="Contact Us" /></button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Contact Us</DialogTitle></DialogHeader>
                <div className="pt-4 space-y-4">
                  <div><p className="text-sm font-medium mb-2">Email Support</p><a href="mailto:remind659@gmail.com" className="text-sm text-primary hover:underline">remind659@gmail.com</a></div>
                  <div><p className="text-sm font-medium mb-2">Response Time</p><p className="text-sm text-muted-foreground">We typically respond within 24-48 hours</p></div>
                </div>
              </DialogContent>
            </Dialog>
          </SettingsSection>

          <SettingsSection title="About">
            <Dialog>
              <DialogTrigger asChild><button className="w-full"><SettingsItem icon={Info} title="App Information" /></button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>About Remonk Reminder</DialogTitle></DialogHeader>
                <div className="pt-4 space-y-3">
                  <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Version</span><span className="text-sm font-medium">1.0.0</span></div>
                  <div className="pt-4 border-t"><p className="text-sm text-muted-foreground">Remonk Reminder helps you manage document expiry dates with AI-powered insights and timely notifications.</p></div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild><button className="w-full"><SettingsItem icon={FileCheck} title="Terms &amp; Privacy" /></button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Terms &amp; Privacy Policy</DialogTitle></DialogHeader>
                <div className="pt-4 space-y-5 max-h-[60vh] overflow-y-auto text-sm text-muted-foreground">
                  <p className="text-base font-medium text-foreground">Your privacy matters to us.</p>
                  <p>Remonk Reminder is designed to help you manage important deadlines and reminders while keeping your data secure. We never sell your personal data.</p>
                </div>
              </DialogContent>
            </Dialog>
          </SettingsSection>

          <div className="mb-6">
            <div className="bg-card rounded-xl border border-border/50 overflow-hidden shadow-sm">
              <button onClick={handleSignOut} className="w-full flex items-center justify-between p-4 hover:bg-destructive/5 smooth cursor-pointer group">
                <div className="flex items-center gap-3">
                  <LogOut className="h-5 w-5 text-destructive" />
                  <span className="text-destructive font-medium">Sign Out</span>
                </div>
                <ChevronRight className="h-5 w-5 text-destructive group-hover:translate-x-1 smooth" />
              </button>
            </div>
          </div>
        </main>
      </div>
      <EditProfileSheet open={editProfileOpen} onOpenChange={(open) => { setEditProfileOpen(open); if (!open) fetchProfile(); }} />
    </AppShell>
  );
}
