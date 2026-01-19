import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import { useToast } from "@/hooks/use-toast";
import { InternationalPhoneInput } from "@/components/ui/international-phone-input";
import { getCountryCode } from "@/utils/countryMapping";

interface Profile {
  id: string;
  display_name: string | null;
  country: string | null;
  phone_number: string | null;
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

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

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
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || "");
        setCountry(data.country || "");
        setPhoneNumber(data.phone_number || "");
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast({
        title: "Error",
        description: "Failed to load profile settings",
        variant: "destructive",
      });
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
        title: "Settings saved",
        description: "Your profile settings have been updated successfully.",
      });

      fetchProfile();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Error",
        description: "Failed to update settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
    <div className="min-h-screen bg-background overflow-y-auto">
      <header className="bg-card border-b border-border px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Account Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your personal information</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 space-y-6 max-w-2xl mx-auto pb-32">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={user?.email || ""}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Contact support to change your email address
              </p>
            </div>

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
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <InternationalPhoneInput
                value={phoneNumber}
                onChange={(val) => setPhoneNumber(val || "")}
                country={getCountryCode(country)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="country">Country/Region</Label>
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
          </CardContent>
        </Card>

        {/* Developer & Testing */}
        <Card>
          <CardHeader>
            <CardTitle>Developer & Testing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => navigate('/test-push')}
            >
              Test Firebase Push Notifications
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => navigate('/test-onesignal')}
            >
              Test OneSignal Push Notifications (Despia)
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => navigate('/test-emails')}
            >
              Test Email Notifications
            </Button>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button onClick={updateProfile} disabled={saving} className="w-full" size="lg">
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </main>

      <BottomNavigation />
    </div>
  );
}
