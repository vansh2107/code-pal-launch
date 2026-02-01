import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { User, Bell, Shield, Trash2, Clock, Globe, Camera, Upload, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { InternationalPhoneInput } from "@/components/ui/international-phone-input";
import { getCountryCode } from "@/utils/countryMapping";
import { TwoFactorAuth } from "./TwoFactorAuth";
import { AvatarEditPopover } from "./AvatarEditPopover";
import { getSignedUrl } from "@/utils/signedUrl";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

interface EditProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0');
  return `${hour}:00`;
});

export function EditProfileSheet({ open, onOpenChange }: EditProfileSheetProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Profile info
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  
  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [expiryReminders, setExpiryReminders] = useState(true);
  const [renewalReminders, setRenewalReminders] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [notificationTime, setNotificationTime] = useState("09:00");

  useEffect(() => {
    if (open && user) {
      loadProfile();
    }
  }, [open, user]);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error) throw error;

      if (data) {
        setDisplayName(data.display_name || "");
        setCountry(data.country || "");
        setPhoneNumber(data.phone_number || "");
        setEmailNotifications(data.email_notifications_enabled ?? true);
        setPushNotifications(data.push_notifications_enabled ?? false);
        setExpiryReminders(data.expiry_reminders_enabled ?? true);
        setRenewalReminders(data.renewal_reminders_enabled ?? true);
        setWeeklyDigest(data.weekly_digest_enabled ?? false);
        setTimezone(data.timezone ?? "UTC");
        setNotificationTime(data.preferred_notification_time?.substring(0, 5) ?? "09:00");
        
        // Load avatar
        if (data.avatar_url) {
          if (data.avatar_url.startsWith('http')) {
            setAvatarSignedUrl(data.avatar_url);
          } else {
            const signedUrl = await getSignedUrl('document-images', data.avatar_url);
            if (signedUrl) {
              setAvatarSignedUrl(signedUrl);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName || null,
          country: country || null,
          phone_number: phoneNumber || null,
          email_notifications_enabled: emailNotifications,
          push_notifications_enabled: pushNotifications,
          expiry_reminders_enabled: expiryReminders,
          renewal_reminders_enabled: renewalReminders,
          weekly_digest_enabled: weeklyDigest,
          timezone: timezone,
          preferred_notification_time: `${notificationTime}:00`,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "All your settings have been saved successfully.",
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: "Error",
        description: "Failed to save profile settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    
    try {
      // Get current avatar path
      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("user_id", user.id)
        .single();
      
      if (profile?.avatar_url && !profile.avatar_url.startsWith('http')) {
        // Remove from storage
        await supabase.storage.from('document-images').remove([profile.avatar_url]);
      }
      
      // Clear avatar URL in profile
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("user_id", user.id);
      
      if (error) throw error;
      
      setAvatarSignedUrl(null);
      toast({
        title: "Photo removed",
        description: "Your profile photo has been removed",
      });
    } catch (error) {
      console.error("Error removing photo:", error);
      toast({
        title: "Error",
        description: "Failed to remove photo",
        variant: "destructive",
      });
    }
  };

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-lg p-0 flex flex-col"
      >
        <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl">Edit Profile</SheetTitle>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-6 space-y-8">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <>
                {/* Profile Photo Section */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Profile Photo
                  </h3>
                  <div className="flex flex-col items-center gap-3">
                    <AvatarEditPopover 
                      userId={user.id}
                      avatarUrl={avatarSignedUrl}
                      onAvatarUpdate={loadProfile}
                      size="lg"
                    />
                    <p className="text-xs text-muted-foreground">Tap to change photo</p>
                    {avatarSignedUrl && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleRemovePhoto}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Remove Photo
                      </Button>
                    )}
                  </div>
                </section>

                <Separator />

                {/* Personal Information */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Personal Information
                  </h3>
                  
                  <div className="space-y-4">
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
                        value={user.email || ""}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        Email cannot be changed
                      </p>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Account Settings Accordion */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Account Settings
                  </h3>
                  
                  <Accordion type="multiple" className="w-full space-y-2">
                    {/* Notification Settings */}
                    <AccordionItem value="notifications" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <Bell className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium">Notification Preferences</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-4 space-y-6">
                        {/* Channels */}
                        <div className="space-y-4">
                          <p className="text-sm font-medium text-muted-foreground">Channels</p>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="email-notifications">Email Notifications</Label>
                              <p className="text-xs text-muted-foreground">Reminders via email</p>
                            </div>
                            <Switch
                              id="email-notifications"
                              checked={emailNotifications}
                              onCheckedChange={setEmailNotifications}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="push-notifications">Push Notifications</Label>
                              <p className="text-xs text-muted-foreground">Real-time push alerts</p>
                            </div>
                            <Switch
                              id="push-notifications"
                              checked={pushNotifications}
                              onCheckedChange={setPushNotifications}
                            />
                          </div>
                        </div>

                        {/* Reminder Types */}
                        <div className="space-y-4">
                          <p className="text-sm font-medium text-muted-foreground">Reminder Types</p>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="expiry-reminders">Document Expiry</Label>
                              <p className="text-xs text-muted-foreground">When documents expire</p>
                            </div>
                            <Switch
                              id="expiry-reminders"
                              checked={expiryReminders}
                              onCheckedChange={setExpiryReminders}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="renewal-reminders">Task Reminders</Label>
                              <p className="text-xs text-muted-foreground">For active tasks</p>
                            </div>
                            <Switch
                              id="renewal-reminders"
                              checked={renewalReminders}
                              onCheckedChange={setRenewalReminders}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="weekly-digest">Incomplete Task Alerts</Label>
                              <p className="text-xs text-muted-foreground">Daily pending reminders</p>
                            </div>
                            <Switch
                              id="weekly-digest"
                              checked={weeklyDigest}
                              onCheckedChange={setWeeklyDigest}
                            />
                          </div>
                        </div>

                        {/* Timing */}
                        <div className="space-y-4">
                          <p className="text-sm font-medium text-muted-foreground">Timing</p>
                          <div className="space-y-2">
                            <Label htmlFor="timezone" className="flex items-center gap-2">
                              <Globe className="h-4 w-4" />
                              Timezone
                            </Label>
                            <Select value={timezone} onValueChange={setTimezone}>
                              <SelectTrigger id="timezone">
                                <SelectValue placeholder="Select timezone" />
                              </SelectTrigger>
                              <SelectContent>
                                {TIMEZONES.map((tz) => (
                                  <SelectItem key={tz} value={tz}>
                                    {tz}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="notification-time" className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              Preferred Time
                            </Label>
                            <Select value={notificationTime} onValueChange={setNotificationTime}>
                              <SelectTrigger id="notification-time">
                                <SelectValue placeholder="Select time" />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_OPTIONS.map((time) => (
                                  <SelectItem key={time} value={time}>
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Security Settings */}
                    <AccordionItem value="security" className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <Shield className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium">Security</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-4 space-y-4">
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Password Reset</h4>
                          <p className="text-sm text-muted-foreground mb-3">
                            Password settings are managed through your email. 
                            You can reset your password via the login page.
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-3">Two-Factor Authentication</h4>
                          <TwoFactorAuth />
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Delete Account */}
                    <AccordionItem value="danger" className="border border-destructive/30 rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <Trash2 className="h-5 w-5 text-destructive" />
                          <span className="font-medium text-destructive">Danger Zone</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-4">
                        <p className="text-sm text-muted-foreground mb-4">
                          Once you delete your account, there is no going back. Please be certain.
                        </p>
                        <DeleteAccountDialog>
                          <Button variant="destructive" className="w-full">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Account
                          </Button>
                        </DeleteAccountDialog>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </section>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer with Save Button */}
        <div className="px-6 py-4 border-t border-border shrink-0 bg-background">
          <Button 
            onClick={handleSave} 
            disabled={saving || loading} 
            className="w-full"
            size="lg"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
