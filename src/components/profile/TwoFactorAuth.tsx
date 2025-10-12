import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, Check } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import QRCode from 'qrcode';

export function TwoFactorAuth() {
  const [factors, setFactors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [factorId, setFactorId] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadFactors();
  }, []);

  const loadFactors = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      setFactors(data?.totp || []);
    } catch (error: any) {
      console.error('Error loading MFA factors:', error);
      toast({
        title: "Error",
        description: "Failed to load 2FA status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const enrollMFA = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App',
      });

      if (error) throw error;

      if (data) {
        setFactorId(data.id);
        setSecret(data.totp.secret);
        
        // Generate QR code
        const qrCode = await QRCode.toDataURL(data.totp.qr_code);
        setQrCodeUrl(qrCode);
      }
    } catch (error: any) {
      console.error('Error enrolling MFA:', error);
      toast({
        title: "Enrollment failed",
        description: error.message || "Failed to start 2FA enrollment",
        variant: "destructive",
      });
      setEnrolling(false);
    }
  };

  const verifyAndEnable = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter a 6-digit code",
        variant: "destructive",
      });
      return;
    }

    setVerifying(true);
    try {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verificationCode,
      });

      if (error) throw error;

      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication has been successfully enabled",
      });

      // Reset state and reload factors
      setEnrolling(false);
      setQrCodeUrl('');
      setFactorId('');
      setVerificationCode('');
      setSecret('');
      await loadFactors();
    } catch (error: any) {
      console.error('Error verifying MFA:', error);
      toast({
        title: "Verification failed",
        description: error.message || "Invalid verification code",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  const disableMFA = async (factorId: string) => {
    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId,
      });

      if (error) throw error;

      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled",
      });

      await loadFactors();
    } catch (error: any) {
      console.error('Error disabling MFA:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to disable 2FA",
        variant: "destructive",
      });
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied",
      description: "Secret key copied to clipboard",
    });
  };

  const cancelEnrollment = () => {
    setEnrolling(false);
    setQrCodeUrl('');
    setFactorId('');
    setVerificationCode('');
    setSecret('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const activeFactor = factors.find(f => f.status === 'verified');

  if (enrolling && qrCodeUrl) {
    return (
      <div className="space-y-4">
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </AlertDescription>
        </Alert>

        <div className="flex flex-col items-center space-y-4">
          <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48 border-2 border-border rounded-lg" />
          
          <div className="w-full space-y-2">
            <Label className="text-xs text-muted-foreground">Or enter this key manually:</Label>
            <div className="flex gap-2">
              <Input
                value={secret}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copySecret}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="w-full space-y-2">
            <Label htmlFor="verification-code">Enter 6-digit code from your app:</Label>
            <Input
              id="verification-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="text-center text-lg tracking-widest font-mono"
            />
          </div>

          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              onClick={cancelEnrollment}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={verifyAndEnable}
              disabled={verifying || verificationCode.length !== 6}
              className="flex-1"
            >
              {verifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Enable'
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeFactor ? (
        <>
          <Alert className="border-success/20 bg-success/5">
            <ShieldCheck className="h-4 w-4 text-success" />
            <AlertDescription className="text-success">
              Two-factor authentication is enabled
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <div className="flex justify-between items-center py-3 px-4 bg-accent/5 rounded-lg">
              <div>
                <p className="font-medium text-sm">Authenticator App</p>
                <p className="text-xs text-muted-foreground">
                  Enrolled on {new Date(activeFactor.created_at).toLocaleDateString()}
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-success" />
            </div>

            <Button
              variant="destructive"
              onClick={() => disableMFA(activeFactor.id)}
              className="w-full"
            >
              <ShieldOff className="h-4 w-4 mr-2" />
              Disable 2FA
            </Button>
          </div>
        </>
      ) : (
        <>
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Add an extra layer of security to your account by enabling two-factor authentication.
            </AlertDescription>
          </Alert>

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>With 2FA enabled, you'll need:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your password</li>
              <li>A code from your authenticator app</li>
            </ul>
          </div>

          <Button onClick={enrollMFA} className="w-full">
            <Shield className="h-4 w-4 mr-2" />
            Enable 2FA
          </Button>
        </>
      )}
    </div>
  );
}
