import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, FileText, Download, User, Shield, Bell, LogOut, HelpCircle, MessageSquare, Info, Mail, FileCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { toast } from "@/hooks/use-toast";
import { useNavigate, Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";
import { DeleteAccountDialog } from "@/components/profile/DeleteAccountDialog";
import { exportToCSV, exportToJSON } from "@/utils/exportData";

interface Profile {
  id: string;
  display_name: string | null;
  country: string | null;
}

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France", 
  "Spain", "Italy", "Netherlands", "Belgium", "Switzerland", "Austria", "Sweden",
  "Norway", "Denmark", "Finland", "Ireland", "Portugal", "Greece", "Poland",
  "Czech Republic", "Hungary", "Romania", "Japan", "South Korea", "China",
  "India", "Singapore", "Malaysia", "Thailand", "Vietnam", "Indonesia",
  "Philippines", "New Zealand", "Mexico", "Brazil", "Argentina", "Chile",
  "Colombia", "Peru", "South Africa", "Egypt", "Nigeria", "Kenya", "UAE",
  "Saudi Arabia", "Israel", "Turkey", "Russia", "Ukraine", "Other"
];

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
    <div className="mb-6 animate-fade-in">
      <h2 className="text-lg font-bold text-foreground mb-3 px-1">{title}</h2>
      <div className="bg-card rounded-xl border border-border/50 overflow-hidden shadow-sm">
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
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);

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
      setDisplayName(data.display_name || "");
      setCountry(data.country || "");
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          display_name: displayName,
          country: country || null
        })
        .eq("user_id", user.id);

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your profile has been saved successfully.",
      });

      setProfileDialogOpen(false);
      fetchProfile();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="bg-card border-b border-border/50 px-4 py-6 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {profile?.display_name || user?.email?.split('@')[0] || 'User'}
            </h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-6">
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

        {/* Account Settings Section */}
        <SettingsSection title="Account Settings">
          <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
            <DialogTrigger asChild>
              <button className="w-full">
                <SettingsItem icon={User} title="Profile Information" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Profile</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="display_name">Display Name</Label>
                  <Input
                    id="display_name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your display name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger id="country">
                      <SelectValue placeholder="Select your country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((countryName) => (
                        <SelectItem key={countryName} value={countryName}>
                          {countryName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={user?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed
                  </p>
                </div>

                <Button onClick={updateProfile} disabled={saving} className="w-full">
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <button className="w-full">
                <SettingsItem icon={Shield} title="Security" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Security Settings</DialogTitle>
              </DialogHeader>
              <div className="pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Password and authentication settings are managed through your email. 
                  You can reset your password via the login page.
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Two-Factor Authentication</span>
                    <span className="text-foreground">Coming Soon</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Biometric Login</span>
                    <span className="text-foreground">Coming Soon</span>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <button className="w-full">
                <SettingsItem icon={Bell} title="Notification Preferences" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Notification Settings</DialogTitle>
              </DialogHeader>
              <div className="pt-4">
                <p className="text-sm text-muted-foreground">
                  Notification customization coming soon. You'll be able to configure:
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground list-disc pl-5">
                  <li>Email notifications</li>
                  <li>Push notifications</li>
                  <li>Reminder timing preferences</li>
                  <li>Notification frequency</li>
                </ul>
              </div>
            </DialogContent>
          </Dialog>

          <DeleteAccountDialog>
            <button className="w-full">
              <SettingsItem icon={Trash2} title="Delete Account" />
            </button>
          </DeleteAccountDialog>
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
                    Contact us through the feedback form or email support@softlyreminder.com
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
                  <a href="mailto:support@softlyreminder.com" className="text-sm text-primary hover:underline">
                    support@softlyreminder.com
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
                <DialogTitle>About Softly Reminder</DialogTitle>
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
                    Softly Reminder helps you manage document expiry dates with AI-powered insights and timely notifications.
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
                    By using Softly Reminder, you agree to our terms of service. The app is provided as-is for document management purposes.
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
  );
}
