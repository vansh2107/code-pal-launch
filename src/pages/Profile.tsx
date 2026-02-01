import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, FileText, Download, User, Shield, Bell, LogOut, HelpCircle, MessageSquare, Info, Mail, FileCheck, Trash2, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { SafeAreaContainer } from "@/components/layout/SafeAreaContainer";
import { toast } from "@/hooks/use-toast";
import { useNavigate, Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";
import { DeleteAccountDialog } from "@/components/profile/DeleteAccountDialog";
import { TwoFactorAuth } from "@/components/profile/TwoFactorAuth";
import { exportToCSV, exportToJSON } from "@/utils/exportData";
import { InternationalPhoneInput } from "@/components/ui/international-phone-input";
import { getCountryCode } from "@/utils/countryMapping";
import { getSignedUrl } from "@/utils/signedUrl";

interface Profile {
  id: string;
  display_name: string | null;
  country: string | null;
  phone_number: string | null;
  avatar_url?: string | null;
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
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setPhoneNumber(data.phone_number || "");
      
      // Fetch signed URL for avatar if it exists and is a path (not a full URL)
      if (data.avatar_url) {
        // Check if it's already a full URL (legacy) or a path
        if (data.avatar_url.startsWith('http')) {
          setAvatarSignedUrl(data.avatar_url);
        } else {
          const signedUrl = await getSignedUrl('document-images', data.avatar_url);
          if (signedUrl) {
            setAvatarSignedUrl(signedUrl);
          }
        }
      }
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
          country: country || null,
          phone_number: phoneNumber || null
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

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select a JPG or PNG image",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select an image under 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploadingAvatar(true);

    try {
      // Create preview immediately
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to storage
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `avatars/${user.id}/profile.${fileExt}`;

      // Remove old avatar if exists
      await supabase.storage.from('document-images').remove([fileName]);

      const { error: uploadError } = await supabase.storage
        .from('document-images')
        .upload(fileName, file, { 
          cacheControl: '3600',
          upsert: true 
        });

      if (uploadError) throw uploadError;

      // Store the file path (not URL) in the database
      // Signed URLs will be generated when displaying the avatar
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: fileName })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      toast({
        title: "Profile photo updated",
        description: "Your profile photo has been saved",
      });

      fetchProfile();
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      setAvatarPreview(null);
      toast({
        title: "Upload failed",
        description: error?.message || "Failed to upload profile photo",
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
        {/* Header */}
        <header className="bg-card border-b border-border/50 px-4 py-4 sticky top-0 z-10">
          <div className="w-full flex items-center gap-3">
            {/* Avatar with Edit Icon */}
            <div className="relative shrink-0">
              <button
                onClick={handleAvatarClick}
                disabled={uploadingAvatar}
                className="relative w-12 h-12 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all hover:opacity-90"
                aria-label="Edit profile photo"
              >
                {avatarPreview || avatarSignedUrl ? (
                  <img 
                    src={avatarPreview || avatarSignedUrl || ''} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <User className={`h-6 w-6 text-primary ${avatarPreview || avatarSignedUrl ? 'hidden' : ''}`} />
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                  </div>
                )}
              </button>
              {/* Pencil Icon Overlay */}
              <button
                onClick={handleAvatarClick}
                disabled={uploadingAvatar}
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                aria-label="Edit profile photo"
              >
                <Pencil className="h-2.5 w-2.5 text-primary-foreground" />
              </button>
            </div>
            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">
                {profile?.display_name || user?.email?.split('@')[0] || 'User'}
              </h1>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
        </header>

      <main className="flex-1 px-4 py-6 w-full max-w-full overflow-x-hidden">
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
          <Dialog>
            <DialogTrigger asChild>
              <button className="w-full">
                <SettingsItem icon={User} title="Profile Information" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Profile Information</DialogTitle>
              </DialogHeader>
              <div className="pt-4 space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Display Name</p>
                  <p className="text-sm font-medium text-foreground">
                    {profile?.display_name || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Country</p>
                  <p className="text-sm font-medium text-foreground">
                    {profile?.country || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Phone Number</p>
                  <p className="text-sm font-medium text-foreground">
                    {profile?.phone_number || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Email</p>
                  <p className="text-sm font-medium text-foreground">
                    {user?.email}
                  </p>
                </div>
                <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <User className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Button>
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
                        <Label htmlFor="phone_number">Phone Number</Label>
                        <InternationalPhoneInput
                          value={phoneNumber}
                          onChange={(val) => setPhoneNumber(val || "")}
                          country={getCountryCode(country)}
                        />
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
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger asChild>
              <button className="w-full">
                <SettingsItem icon={Shield} title="Security" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Security Settings</DialogTitle>
              </DialogHeader>
              <div className="pt-4 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Password Reset</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Password settings are managed through your email. 
                    You can reset your password via the login page.
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3">Two-Factor Authentication</h3>
                  <TwoFactorAuth />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <SettingsItem icon={Bell} title="Notification Preferences" to="/notification-settings" />

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
    </SafeAreaContainer>
  );
}
