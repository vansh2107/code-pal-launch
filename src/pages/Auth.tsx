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
import { InternationalPhoneInput } from "@/components/ui/international-phone-input";
import { getCountryCode } from "@/utils/countryMapping";

const signInSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
    .regex(/[0-9]/, "Password must contain at least 1 number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least 1 special character"),
});

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
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
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  
  // Sign-up OTP states
  const [signupOtpSent, setSignupOtpSent] = useState(false);
  const [signupOtpCode, setSignupOtpCode] = useState("");
  const [signupOtpVerified, setSignupOtpVerified] = useState(false);
  
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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const validation = signInSchema.parse({ email, password });

      const { error } = await supabase.auth.signInWithPassword({
        email: validation.email,
        password: validation.password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setError("Invalid email or password. Please try again.");
        } else if (error.message.includes("Email not confirmed")) {
          setError("Please check your email and confirm your account before signing in.");
        } else {
          setError(error.message);
        }
        return;
      }

      // Success - user will be redirected by useEffect
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

  const handleSendSignupOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Validate initial fields
      if (!name.trim() || name.trim().length < 2) {
        setError("Name must be at least 2 characters");
        setLoading(false);
        return;
      }

      if (!country) {
        setError("Please select your country");
        setLoading(false);
        return;
      }

      const cleanedPhoneNumber = phoneNumber.replace(/\s+/g, '');
      
      // Validate phone number format
      if (!/^\+?[0-9]{10,15}$/.test(cleanedPhoneNumber)) {
        setError("Please enter a valid phone number with country code (e.g., +1234567890)");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-otp-sms", {
        body: {
          phone_number: cleanedPhoneNumber,
        },
      });

      if (error || !data?.success) {
        console.error("Failed to send OTP:", error);
        setError(data?.error || "Failed to send OTP. Please try again.");
        return;
      }

      console.log("OTP sent:", data);
      setSignupOtpSent(true);
      setSuccess("OTP sent to your phone!");
    } catch (err: any) {
      console.error("Error:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignupOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const cleanedPhoneNumber = phoneNumber.replace(/\s+/g, '');
      
      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: {
          phone_number: cleanedPhoneNumber,
          otp_code: signupOtpCode,
        },
      });

      if (error || !data?.success) {
        console.error("OTP verification failed:", error);
        setError(data?.error || "Invalid OTP. Please try again.");
        return;
      }

      console.log("OTP verified successfully");
      setSignupOtpVerified(true);
      setSuccess("Phone verified! Creating your account...");
      
      // Automatically proceed to sign up
      await completeSignUp();
    } catch (err: any) {
      console.error("Error:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const completeSignUp = async () => {
    try {
      const cleanedPhoneNumber = phoneNumber.replace(/\s+/g, '');
      const validation = signUpSchema.parse({ 
        name, 
        email, 
        password, 
        phone_number: cleanedPhoneNumber 
      });

      const redirectUrl = `${window.location.origin}/`;

      const { error, data } = await supabase.auth.signUp({
        email: validation.email,
        password: validation.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            display_name: validation.name,
            country: country,
            phone_number: validation.phone_number
          }
        }
      });

      // Store phone number in profiles table
      if (data.user && !error) {
        await supabase
          .from("profiles")
          .update({ 
            phone_number: validation.phone_number,
            display_name: validation.name,
            country: country
          })
          .eq("user_id", data.user.id);
      }

      if (error) {
        if (error.message.includes("already registered")) {
          setError("An account with this email already exists. Please sign in instead.");
        } else {
          setError(error.message);
        }
      } else {
        setSuccess("Account created! Check your email for the confirmation link.");
        // Reset form
        setTimeout(() => {
          setName("");
          setEmail("");
          setPassword("");
          setPhoneNumber("");
          setCountry("");
          setSignupOtpSent(false);
          setSignupOtpCode("");
          setSignupOtpVerified(false);
        }, 2000);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError("An unexpected error occurred");
      }
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
          <CardTitle className="text-2xl font-bold">Softly Reminder</CardTitle>
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
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
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
            </TabsContent>
            
            <TabsContent value="signup">
              {!signupOtpSent && (
                <form onSubmit={handleSendSignupOTP} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                      required
                      disabled={loading}
                    />
                  </div>
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
                    <InternationalPhoneInput
                      value={phoneNumber}
                      onChange={(val) => setPhoneNumber(val || "")}
                      country={getCountryCode(country)}
                      disabled={loading}
                    />
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
                    Send OTP
                  </Button>
                </form>
              )}

              {signupOtpSent && !signupOtpVerified && (
                <form onSubmit={handleVerifySignupOTP} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-otp-code">Enter OTP</Label>
                    <Input
                      id="signup-otp-code"
                      type="text"
                      value={signupOtpCode}
                      onChange={(e) => setSignupOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
                    Verify OTP & Create Account
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="w-full text-sm"
                    onClick={() => {
                      setSignupOtpSent(false);
                      setSignupOtpCode("");
                      setError("");
                      setSuccess("");
                    }}
                  >
                    Change phone number
                  </Button>
                </form>
              )}

              {signupOtpVerified && (
                <Alert>
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}
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
