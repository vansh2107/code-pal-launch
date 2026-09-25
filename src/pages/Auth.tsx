/**
 * src/pages/Auth.tsx — Firebase Auth sign-in / sign-up page
 *
 * Replaces Supabase Auth calls with the Firebase auth layer.
 * UX changes from Supabase version:
 *   - Sign-up: sends Firebase email-verification link instead of a
 *     manual 6-digit OTP code (Supabase pattern). The OTP entry step
 *     is replaced with a "check your email" confirmation screen.
 *   - Password reset: calls Firebase sendPasswordResetEmail.
 *   - All validation schemas, form layout, and error messages are unchanged.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { z } from 'zod';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InternationalPhoneInput } from '@/components/ui/international-phone-input';
import { getCountryCode } from '@/utils/countryMapping';
import {
  signIn,
  signUp,
  sendPasswordReset,
  type SignUpMetadata,
} from '@/integrations/firebase/auth';
import { callSendOtp, callVerifyOtp } from '@/integrations/firebase/functions';
import { doc, setDoc } from 'firebase/firestore';
import { firebaseDb, firebaseAuth } from '@/integrations/firebase/client';

const signInSchema = z.object({
  email:    z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(12,  'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least 1 number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least 1 special character'),
});

const signUpSchema = z.object({
  name:         z.string().trim().min(2, 'Name must be at least 2 characters'),
  email:        z.string().email('Please enter a valid email address'),
  password:     z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least 1 number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least 1 special character'),
  phone_number: z.string()
    .trim()
    .min(10,  'Phone number must be at least 10 digits')
    .max(15,  'Phone number cannot exceed 15 digits')
    .regex(/^\+?[0-9]+$/, 'Phone number must contain only digits and optional + prefix'),
});

import { countryNameToCode } from '@/utils/countryMapping';

const COUNTRIES = Object.keys(countryNameToCode)
  .concat(['Other'])
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

export default function Auth() {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [name,        setName]        = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [country,     setCountry]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  // ── Sign up state & OTP flow ─────────────────────────────────────────────
  const [otpStep,          setOtpStep]          = useState(false);
  const [otpCode,          setOtpCode]          = useState('');
  const [agreedToTerms,       setAgreedToTerms]       = useState(false);
  const [termsDialogOpen,     setTermsDialogOpen]     = useState(false);
  const [forgotPasswordOpen,  setForgotPasswordOpen]  = useState(false);
  const [resetEmail,          setResetEmail]          = useState('');

  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect to dashboard if user is authenticated
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // ── Forgot password ──────────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await sendPasswordReset(resetEmail);
      if (!result.ok) {
        setError((result as { error?: string }).error ?? "Something went wrong");
      } else {
        setSuccess('A password reset link has been sent to your email!');
        setTimeout(() => {
          setForgotPasswordOpen(false);
          setResetEmail('');
          setSuccess('');
        }, 3000);
      }
    } catch {
      setError('Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  // ── Sign in ──────────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const validation = signInSchema.parse({ email, password });
      const result     = await signIn(validation.email, validation.password);
      if (!result.ok) {
        setError((result as { error?: string }).error ?? "Something went wrong");
      }
    } catch (err) {
      if (err instanceof z.ZodError) setError(err.errors[0].message);
      else setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 1: Request Email OTP ─────────────────────────────────────────────
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!name.trim() || name.trim().length < 2) {
        setError('Name must be at least 2 characters');
        setLoading(false);
        return;
      }
      if (!country) {
        setError('Please select your country');
        setLoading(false);
        return;
      }

      const cleanedPhone = phoneNumber.replace(/\s+/g, '');
      if (!/^\+?[0-9]{10,15}$/.test(cleanedPhone)) {
        setError('Please enter a valid phone number with country code (e.g. +1234567890)');
        setLoading(false);
        return;
      }

      signUpSchema.parse({
        name, email, password, phone_number: cleanedPhone,
      });

      // Request server-side OTP email send
      const response = await callSendOtp({ phoneNumber: cleanedPhone, email });
      if (!response.success) {
        setError(response.message || 'Failed to send OTP email.');
        return;
      }

      setOtpStep(true);
      setSuccess(`A 6-digit OTP has been sent to ${email}. Please enter it below to complete signup.`);
    } catch (err: any) {
      if (err instanceof z.ZodError) setError(err.errors[0].message);
      else if (err?.message) setError(err.message);
      else setError('An unexpected error occurred while requesting OTP.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify OTP Server-Side and Finalize Signup ───────────────────
  const handleVerifyOtpAndSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!otpCode || otpCode.trim().length !== 6) {
        setError('Please enter a valid 6-digit OTP code');
        setLoading(false);
        return;
      }

      const cleanedPhone = phoneNumber.replace(/\s+/g, '');

      // Server-side verification of OTP
      const verifyRes = await callVerifyOtp({ phoneNumber: cleanedPhone, otpCode: otpCode.trim() });
      if (!verifyRes.success) {
        setError(verifyRes.message || 'Invalid or expired OTP code.');
        return;
      }

      // OTP verified successfully → finalize account creation
      const metadata: SignUpMetadata = {
        displayName: name.trim(),
        country,
        phoneNumber: cleanedPhone,
      };

      const result = await signUp(email, password, metadata);
      if (!result.ok) {
        setError((result as { error?: string }).error ?? "Something went wrong");
        return;
      }

      try {
        const uid = result.data.uid;
        await setDoc(
          doc(firebaseDb, `users/${uid}/profile/data`),
          {
            userId:      uid,
            displayName: name.trim(),
            email,
            phoneNumber: cleanedPhone,
            country,
            updatedAt:   new Date().toISOString(),
          },
          { merge: true },
        );
      } catch (profileErr) {
        console.warn('[Auth] Profile patch failed (non-critical):', profileErr);
      }

      setSuccess('Account created and verified successfully!');
      // AuthProvider listener will redirect to '/'
    } catch (err: any) {
      if (err?.message) setError(err.message);
      else setError('Failed to finalize signup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center page-bg px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 btn-glow rounded-xl">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Remonk Reminder</CardTitle>
          <CardDescription>Secure document management and reminders</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            {/* ── Sign In ── */}
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input id="signin-email" type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com"
                    required disabled={loading} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input id="signin-password" type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password"
                    required disabled={loading} />
                </div>
                {error   && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign In
                </Button>
                <Button type="button" variant="link" className="w-full text-sm"
                  onClick={() => { setForgotPasswordOpen(true); setError(''); setSuccess(''); }}>
                  Forgot password?
                </Button>
              </form>
            </TabsContent>

            {/* ── Sign Up ── */}
            <TabsContent value="signup">
              {!otpStep ? (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Name</Label>
                    <Input id="signup-name" type="text" value={name}
                      onChange={(e) => setName(e.target.value)} placeholder="Your full name"
                      required disabled={loading} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input id="signup-email" type="email" value={email}
                      onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com"
                      required disabled={loading} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input id="signup-password" type="password" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password (min 12 characters)"
                      required disabled={loading} />
                    <p className="text-xs text-muted-foreground">
                      Must be at least 12 characters with 1 uppercase, 1 number, and 1 special character
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone-number">Phone Number</Label>
                    <InternationalPhoneInput value={phoneNumber}
                      onChange={(val) => setPhoneNumber(val ?? '')}
                      country={getCountryCode(country)} disabled={loading} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Select value={country} onValueChange={setCountry} disabled={loading}>
                      <SelectTrigger id="country"><SelectValue placeholder="Select your country" /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Checkbox id="terms" checked={agreedToTerms}
                      onCheckedChange={(ch) => setAgreedToTerms(ch === true)}
                      disabled={loading} className="mt-0.5" />
                    <label htmlFor="terms" className="text-sm leading-snug text-muted-foreground cursor-pointer">
                      I agree to the{' '}
                      <button type="button" className="text-primary underline hover:text-primary/80 font-medium"
                        onClick={(e) => { e.preventDefault(); setTermsDialogOpen(true); }}>
                        Terms &amp; Conditions
                      </button>
                    </label>
                  </div>
                  {error   && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                  {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}
                  <Button type="submit" className="w-full" disabled={loading || !agreedToTerms}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send OTP Code
                  </Button>
                </form>
              ) : (
                /* Step 2: 6-Digit OTP Verification Entry */
                <form onSubmit={handleVerifyOtpAndSignUp} className="space-y-4">
                  <div className="text-center space-y-2">
                    <div className="flex justify-center">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mail className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold">Verify Email OTP</h3>
                    <p className="text-xs text-muted-foreground">
                      We sent a 6-digit verification code to <strong>{email}</strong>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="otp-code">6-Digit OTP Code</Label>
                    <Input id="otp-code" type="text" maxLength={6} value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000" required disabled={loading}
                      className="text-center text-lg tracking-widest font-mono" />
                  </div>

                  {error   && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                  {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}

                  <Button type="submit" className="w-full" disabled={loading || otpCode.trim().length !== 6}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify &amp; Create Account
                  </Button>
                  <Button type="button" variant="outline" className="w-full text-sm"
                    onClick={() => { setOtpStep(false); setOtpCode(''); setError(''); setSuccess(''); }}>
                    Go back
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Forgot password dialog */}
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
              <Input id="reset-email" type="email" value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)} placeholder="your@email.com"
                required disabled={loading} />
            </div>
            {error   && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send Reset Link
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Terms dialog (unchanged) */}
      <Dialog open={termsDialogOpen} onOpenChange={setTermsDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Terms &amp; Conditions</DialogTitle>
            <DialogDescription>Please read the following terms carefully before using Remonk Reminder.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p><strong className="text-foreground">1. Acceptance of Terms</strong><br />By creating an account and using Remonk Reminder, you agree to be bound by these Terms &amp; Conditions.</p>
            <p><strong className="text-foreground">2. Use of Service</strong><br />Remonk Reminder is a document management and reminder tool. You are responsible for the accuracy of documents you upload.</p>
            <p><strong className="text-foreground">3. User Data &amp; Privacy</strong><br />We collect and store your personal information securely. We do not sell or share your data with third parties.</p>
            <p><strong className="text-foreground">4. Document Storage</strong><br />Documents are stored securely in encrypted cloud storage.</p>
            <p><strong className="text-foreground">5. Notifications</strong><br />By enabling notifications, you consent to receiving push notifications and emails related to document expiry reminders.</p>
            <p><strong className="text-foreground">6. Account Termination</strong><br />We reserve the right to suspend accounts that violate these terms.</p>
            <p><strong className="text-foreground">7. Changes to Terms</strong><br />Continued use after changes constitutes acceptance.</p>
            <p><strong className="text-foreground">8. Contact</strong><br />If you have questions, reach out through the Help Center in the app.</p>
          </div>
          <Button onClick={() => setTermsDialogOpen(false)} className="w-full mt-4">Close</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
