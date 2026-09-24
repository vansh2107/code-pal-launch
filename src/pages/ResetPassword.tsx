/**
 * src/pages/ResetPassword.tsx — Firebase password reset page
 *
 * Replaces Supabase auth calls with Firebase equivalents.
 * Firebase uses action codes (oobCode URL param) instead of a session exchange.
 * UI and validation are preserved exactly.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { applyActionCode, verifyPasswordResetCode } from 'firebase/auth';
import { firebaseAuth } from '@/integrations/firebase/client';
import { confirmPasswordReset } from '@/integrations/firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Shield, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z.object({
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least 1 number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least 1 special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path:    ['confirmPassword'],
});

export default function ResetPassword() {
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');
  const [success,         setSuccess]         = useState(false);
  const [validSession,    setValidSession]    = useState(false);
  const [oobCode,         setOobCode]         = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const url    = new URL(window.location.href);
    const code   = url.searchParams.get('oobCode');
    const mode   = url.searchParams.get('mode');

    if (!code) {
      setError('Invalid or expired reset link. Please request a new password reset.');
      return;
    }

    // Firebase sends mode=resetPassword for password resets
    // and mode=verifyEmail for email verification
    if (mode === 'verifyEmail') {
      // Handle email verification redirect
      applyActionCode(firebaseAuth, code)
        .then(() => {
          setValidSession(true);
          setError('');
          // Redirect to dashboard after email verified
          setTimeout(() => navigate('/', { replace: true }), 2000);
        })
        .catch((err) => {
          setError(err?.message ?? 'Invalid or expired verification link.');
        });
      return;
    }

    // Validate the reset code before showing the form
    verifyPasswordResetCode(firebaseAuth, code)
      .then(() => {
        setOobCode(code);
        setValidSession(true);
        setError('');
      })
      .catch((err) => {
        setError(
          err?.code === 'auth/expired-action-code'
            ? 'This link has expired. Please request a new password reset.'
            : 'Invalid or expired reset link. Please request a new password reset.',
        );
      });
  }, [navigate]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const validation = passwordSchema.parse({ password, confirmPassword });

      if (!oobCode) {
        setError('Invalid reset link.');
        return;
      }

      const result = await confirmPasswordReset(oobCode, validation.password);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => navigate('/', { replace: true }), 2000);
      }
    } catch (err) {
      if (err instanceof z.ZodError) setError(err.errors[0].message);
      else setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold">Password Updated!</h2>
              <p className="text-muted-foreground">
                Your password has been successfully updated. Redirecting you to the dashboard...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center page-bg px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 btn-glow rounded-xl">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Reset Your Password</CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          {!validSession ? (
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error || 'Validating reset link...'}</AlertDescription>
                </Alert>
              )}
              {!error && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Validating link...</span>
                </div>
              )}
              <Button onClick={() => navigate('/auth')} className="w-full">Go to Login</Button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input id="password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password" required disabled={loading} />
                <p className="text-xs text-muted-foreground">
                  Must be at least 12 characters with 1 uppercase, 1 number, and 1 special character
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password" required disabled={loading} />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
