import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
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

  const saveAction = (
    <Button onClick={updateProfile} disabled={saving} size="sm">
      {saving ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Saving...
        </>
      ) : (
        <>
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </>
      )}
    </Button>
  );

  if (loading) {
    return (
      <AppShell contentWidth="narrow">
        <PageHeader
          title={<Skeleton className="h-8 w-52" />}
          description={<Skeleton className="h-4 w-64" />}
          back
          variant="sticky"
        />
        <div className="space-y-6 pb-6">
          <Skeleton className="h-64 rounded-[16px]" />
          <Skeleton className="h-52 rounded-[16px]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell contentWidth="narrow">
      <PageHeader
        title="Account Settings"
        description="Manage your personal information"
        back
        action={saveAction}
        variant="sticky"
      />

      <div className="space-y-6 pb-6">
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
      </div>
    </AppShell>
  );
}
