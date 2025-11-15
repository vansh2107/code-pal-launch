import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
    .regex(/[0-9]/, "Password must contain at least 1 number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least 1 special character"),
  phone_number: z.string()
    .trim()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^\+?[0-9]+$/, "Phone number must contain only digits and optional + prefix"),
});

const signUpSchema = signInSchema.extend({
  phone_number: z.string()
    .trim()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^\+?[0-9]+$/, "Phone number must contain only digits and optional + prefix"),
});

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France", 
  "Spain", "Italy", "Netherlands", "Belgium", "Switzerland", "Austria", "Sweden",
  "Norway", "Denmark", "Finland", "Ireland", "Portugal", "Greece", "Poland",
  "Czech Republic", "Japan", "South Korea", "Singapore", "India", "Brazil",
  "Mexico", "Argentina", "Chile", "Colombia", "Other"
];

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess("A new password reset link has been sent to your email!");
        setTimeout(() => {
          setForgotPasswordOpen(false);
          setResetEmail("");
          setSuccess("");
        }, 3000);
      }
    } catch (err) {
      setError("Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const cleanedPhoneNumber = phoneNumber.replace(/\s+/g, '');
      
      if (!cleanedPhoneNumber || cleanedPhoneNumber.length < 10) {
        setError("Please enter a valid phone number");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-otp-sms", {
        body: { phone_number: cleanedPhoneNumber },
      });

      if (error) {
        console.error("Error sending OTP:", error);
        setError("Failed to send OTP. Please try again.");
        return;
      }

      console.log("OTP sent:", data);
      setOtpSent(true);
      setSuccess("OTP sent to your phone number!");
    } catch (err: any) {
      console.error("Error:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const cleanedPhoneNumber = phoneNumber.replace(/\s+/g, '');

      if (!otpCode || otpCode.length !== 6) {
        setError("Please enter a valid 6-digit OTP");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: {
          phone_number: cleanedPhoneNumber,
          otp_code: otpCode,
        },
      });

      if (error || !data?.success) {
        console.error("OTP verification failed:", error);
        setError(data?.error || "Invalid OTP. Please try again.");
        return;
      }

      console.log("OTP verified:", data);
      
      // Store the verified email (or use the one from the form if null)
      const emailToUse = data.email || email;
      if (!emailToUse) {
        setError("Unable to retrieve your email. Please try again or contact support.");
        return;
      }
      
      setVerifiedEmail(emailToUse);
      setSuccess("Phone verified! Please enter your password.");
    } catch (err: any) {
      console.error("Error:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: verifiedEmail,
        password: password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setError("Invalid password. Please try again.");
        } else {
          setError(error.message);
        }
        return;
      }

      // Success - user will be redirected by useEffect
    } catch (err: any) {
      console.error("Error:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Remove spaces from phone number before validation
      const cleanedPhoneNumber = phoneNumber.replace(/\s+/g, '');
      const validation = signUpSchema.parse({ email, password, phone_number: cleanedPhoneNumber });
      
      if (!country) {
        setError("Please select your country");
        setLoading(false);
        return;
      }

      const redirectUrl = `https://code-pal-launch.vercel.app/`;

      const { error, data } = await supabase.auth.signUp({
        email: validation.email,
        password: validation.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            country: country,
            phone_number: validation.phone_number
          }
        }
      });

      // Store phone number in profiles table
      if (data.user && !error) {
        await supabase
          .from("profiles")
          .update({ phone_number: validation.phone_number })
          .eq("user_id", data.user.id);
      }

      if (error) {
        if (error.message.includes("already registered")) {
          setError("An account with this email already exists. Please sign in instead.");
        } else {
          setError(error.message);
        }
      } else {
        setSuccess("Check your email for the confirmation link!");
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Remove spaces from phone number before validation
      const cleanedPhoneNumber = phoneNumber.replace(/\s+/g, '');
      const validation = signInSchema.parse({ email, password, phone_number: cleanedPhoneNumber });

      const { error, data } = await supabase.auth.signInWithPassword({
        email: validation.email,
        password: validation.password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setError("Invalid email or password. Please check your credentials.");
        } else {
          setError(error.message);
        }
        return;
      }

      // Verify phone number matches profile
      if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("phone_number")
          .eq("user_id", data.user.id)
          .single();

        if (profileError || !profile) {
          setError("Unable to verify phone number");
          await supabase.auth.signOut();
          return;
        }

        const normalize = (s: string) => (s ?? "").replace(/[\s\-()]/g, "");
        if (normalize(profile.phone_number) !== normalize(validation.phone_number)) {
          setError("Phone number does not match our records");
          await supabase.auth.signOut();
          return;
        }
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-primary rounded-xl">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Remonk Reminder</CardTitle>
          <CardDescription>
            Secure document management and reminders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              {!otpSent && !verifiedEmail && (
                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-phone-number">Phone Number</Label>
                    <Input
                      id="signin-phone-number"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+1234567890"
                      required
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter with country code (e.g., +1234567890)
                    </p>
                  </div>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {success && (
                    <Alert>
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send OTP
                  </Button>
                </form>
              )}

              {otpSent && !verifiedEmail && (
                <form onSubmit={handleVerifyOTP} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="otp-code">Enter OTP</Label>
                    <Input
                      id="otp-code"
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="123456"
                      maxLength={6}
                      required
                      disabled={loading}
                      className="text-center text-2xl tracking-widest"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the 6-digit code sent to {phoneNumber}
                    </p>
                  </div>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {success && (
                    <Alert>
                      <AlertDescription>{success}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify OTP
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="w-full text-sm"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode("");
                      setError("");
                      setSuccess("");
                    }}
                  >
                    Change phone number
                  </Button>
                </form>
              )}

              {verifiedEmail && (
                <form onSubmit={handleFinalSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be at least 12 characters with 1 uppercase, 1 number, and 1 special character
                    </p>
                  </div>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign In
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="w-full text-sm"
                    onClick={() => {
                      setForgotPasswordOpen(true);
                      setError("");
                      setSuccess("");
                    }}
                  >
                    Forgot password?
                  </Button>
                </form>
              )}
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password (min 12 characters)"
                    required
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be at least 12 characters with 1 uppercase, 1 number, and 1 special character
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone-number">Phone Number</Label>
                  <Input
                    id="phone-number"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1234567890"
                    required
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter with country code (e.g., +1234567890)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Select value={country} onValueChange={setCountry} disabled={loading}>
                    <SelectTrigger id="country">
                      <SelectValue placeholder="Select your country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {success && (
                  <Alert>
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Reset Link
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}