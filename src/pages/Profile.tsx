import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, FileText, Download, User, LogOut, HelpCircle, MessageSquare, Info, Mail, FileCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { SafeAreaContainer } from "@/components/layout/SafeAreaContainer";
import { toast } from "@/hooks/use-toast";
import { useNavigate, Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";
import { exportToCSV, exportToJSON } from "@/utils/exportData";
import { getSignedUrl } from "@/utils/signedUrl";
import { AvatarEditPopover } from "@/components/profile/AvatarEditPopover";
import { EditProfileSheet } from "@/components/profile/EditProfileSheet";

interface Profile {
  id: string;
  display_name: string | null;
  country: string | null;
  phone_number: string | null;
  avatar_url?: string | null;
}

interface SettingsItemProps {
  icon: React.ElementType;
  title: string;
  onClick?: () => void;
  to?: string;
}

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

  if (to) {
    return (
      <Link to={to} className="block border-b border-border/50 last:border-0">
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className="w-full text-left border-b border-border/50 last:border-0">
      {content}
    </button>
  );
}

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className="mb-6 animate-fade-in w-full">
      <h2 className="text-xl font-semibold text-foreground mb-3 px-1">{title}</h2>
      <div className="w-full bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
        {children}
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;
      setProfile(data);
      
      // Fetch signed URL for avatar if it exists
      if (data.avatar_url) {
        if (data.avatar_url.startsWith('http')) {
          setAvatarSignedUrl(data.avatar_url);
        } else {
          const signedUrl = await getSignedUrl('document-images', data.avatar_url);
          if (signedUrl) {
            setAvatarSignedUrl(signedUrl);
          }
        }
      } else {
        setAvatarSignedUrl(null);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  const handleExportCSV = async () => {
    try {
      const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user?.id);

      if (documents) {
        exportToCSV(documents);
        toast({
          title: "Export successful",
          description: "Your documents have been exported to CSV",
        });
      }
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Could not export documents",
        variant: "destructive",
      });
    }
  };

  const handleExportJSON = async () => {
    try {
      const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user?.id);

      if (documents) {
        exportToJSON(documents);
        toast({
          title: "Export successful",
          description: "Your documents have been exported to JSON",
        });
      }
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Could not export documents",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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
        {/* Header with Profile Info */}
        <header className="bg-card border-b border-border/50 px-4 py-4 sticky top-0 z-10">
          <div className="w-full flex items-center gap-3">
            {/* Avatar with WhatsApp-style Edit */}
            {user && (
              <AvatarEditPopover 
                userId={user.id}
                avatarUrl={avatarSignedUrl}
                onAvatarUpdate={fetchProfile}
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">
                {profile?.display_name || user?.email?.split('@')[0] || 'User'}
              </h1>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 w-full max-w-full overflow-x-hidden">
          {/* Account Section - Edit Profile as main action */}
          <SettingsSection title="Account">
            <SettingsItem 
              icon={User} 
              title="Edit Profile" 
              onClick={() => setEditProfileOpen(true)} 
            />
          </SettingsSection>

          {/* Documents Section */}
          <SettingsSection title="Documents">
            <SettingsItem icon={FileText} title="My Documents" to="/documents" />
            <Dialog>
              <DialogTrigger asChild>
                <button className="w-full">
                  <SettingsItem icon={Download} title="Export Data" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Export Your Documents</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Button onClick={handleExportCSV} className="w-full" variant="outline">
                    <FileCheck className="h-4 w-4 mr-2" />
                    Export as CSV
                  </Button>
                  <Button onClick={handleExportJSON} className="w-full" variant="outline">
                    <FileCheck className="h-4 w-4 mr-2" />
                    Export as JSON
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </SettingsSection>

          {/* Support Section */}
          <SettingsSection title="Support">
            <Dialog>
              <DialogTrigger asChild>
                <button className="w-full">
                  <SettingsItem icon={HelpCircle} title="Help Center" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Help Center</DialogTitle>
                </DialogHeader>
                <div className="pt-4 space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">How to scan documents?</h3>
                    <p className="text-sm text-muted-foreground">
                      Tap the Scan button, allow camera access, and position your document within the frame. The app will automatically detect and capture it.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Managing reminders</h3>
                    <p className="text-sm text-muted-foreground">
                      Reminders are automatically set based on document expiry dates. You can customize them in the document details page.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Need more help?</h3>
                    <p className="text-sm text-muted-foreground">
                      Contact us through the feedback form or email remind659@gmail.com
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <button className="w-full">
                  <SettingsItem icon={MessageSquare} title="Send Feedback" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send Feedback</DialogTitle>
                </DialogHeader>
                <div className="pt-4">
                  <FeedbackDialog />
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <button className="w-full">
                  <SettingsItem icon={Mail} title="Contact Us" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Contact Us</DialogTitle>
                </DialogHeader>
                <div className="pt-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Email Support</p>
                    <a href="mailto:remind659@gmail.com" className="text-sm text-primary hover:underline">
                      remind659@gmail.com
                    </a>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Business Hours</p>
                    <p className="text-sm text-muted-foreground">
                      Monday - Friday: 9:00 AM - 6:00 PM
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Response Time</p>
                    <p className="text-sm text-muted-foreground">
                      We typically respond within 24-48 hours
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </SettingsSection>

          {/* About Section */}
          <SettingsSection title="About">
            <Dialog>
              <DialogTrigger asChild>
                <button className="w-full">
                  <SettingsItem icon={Info} title="App Information" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>About Remonk Reminder</DialogTitle>
                </DialogHeader>
                <div className="pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Version</span>
                    <span className="text-sm font-medium">1.0.0</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Build</span>
                    <span className="text-sm font-medium">2025.01</span>
                  </div>
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Remonk Reminder helps you manage document expiry dates with AI-powered insights and timely notifications.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <button className="w-full">
                  <SettingsItem icon={FileCheck} title="Terms & Privacy" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Terms & Privacy Policy</DialogTitle>
                </DialogHeader>
                <div className="pt-4 space-y-4 max-h-[60vh] overflow-y-auto">
                  <div>
                    <h3 className="font-semibold mb-2">Privacy Policy</h3>
                    <p className="text-sm text-muted-foreground">
                      Your privacy is important to us. All document data is encrypted and stored securely. We never share your personal information with third parties.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Data Storage</h3>
                    <p className="text-sm text-muted-foreground">
                      Documents are stored with end-to-end encryption. You have full control over your data and can export or delete it at any time.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Terms of Service</h3>
                    <p className="text-sm text-muted-foreground">
                      By using Remonk Reminder, you agree to our terms of service. The app is provided as-is for document management purposes.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </SettingsSection>

          {/* Sign Out */}
          <div className="mb-6">
            <div className="bg-card rounded-xl border border-border/50 overflow-hidden shadow-sm">
              <button 
                onClick={handleSignOut}
                className="w-full flex items-center justify-between p-4 hover:bg-destructive/5 smooth cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <LogOut className="h-5 w-5 text-destructive" />
                  <span className="text-destructive font-medium">Sign Out</span>
                </div>
                <ChevronRight className="h-5 w-5 text-destructive group-hover:translate-x-1 smooth" />
              </button>
            </div>
          </div>
        </main>

        <BottomNavigation />
      </div>

      {/* Edit Profile Sheet */}
      <EditProfileSheet 
        open={editProfileOpen} 
        onOpenChange={(open) => {
          setEditProfileOpen(open);
          if (!open) {
            // Refresh profile when sheet closes
            fetchProfile();
          }
        }} 
      />
    </SafeAreaContainer>
  );
}
