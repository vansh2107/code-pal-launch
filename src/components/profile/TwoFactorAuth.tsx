import { useState, useEffect } from 'react';
import { auth } from '@/integrations/firebase/client';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Shield, ShieldCheck, ShieldOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function TwoFactorAuth() {
  const [loading, setLoading] = useState(false);
  const user = auth.currentUser;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-medium">Two-Factor Authentication</h3>
          <p className="text-sm text-muted-foreground">
            Multi-factor authentication (MFA) is managed directly via your account security settings.
          </p>
        </div>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Firebase authentication automatically enforces multi-factor authentication if enabled for your account domain/provider.
        </AlertDescription>
      </Alert>
    </div>
  );
}
