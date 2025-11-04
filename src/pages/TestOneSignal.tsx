import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Bell, CheckCircle, XCircle, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOneSignalPlayerId } from '@/hooks/useOneSignalPlayerId';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TestOneSignal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isRegistered, playerId, registerManualPlayerId } = useOneSignalPlayerId();
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [manualPlayerId, setManualPlayerId] = useState('');
  const [registeringPlayerId, setRegisteringPlayerId] = useState(false);

  const handleRegisterPlayerId = async () => {
    if (!manualPlayerId.trim()) {
      setResult({
        success: false,
        message: 'Please enter a valid OneSignal Player ID'
      });
      return;
    }

    setRegisteringPlayerId(true);
    setResult(null);

    try {
      const success = await registerManualPlayerId(manualPlayerId, 'Despia Mobile App');
      
      if (success) {
        setResult({
          success: true,
          message: 'OneSignal Player ID registered successfully! Now you can test push notifications.'
        });
        setManualPlayerId('');
      } else {
        setResult({
          success: false,
          message: 'Failed to register OneSignal Player ID. Please try again.'
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Error registering Player ID: ' + (error as Error).message
      });
    } finally {
      setRegisteringPlayerId(false);
    }
  };

  const handleTestNotification = async () => {
    if (!user) {
      setResult({
        success: false,
        message: 'You must be logged in to test push notifications'
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('send-onesignal-notification', {
        body: {
          userId: user.id,
          title: '📱 Test: OneSignal Notification',
          message: 'Your OneSignal push notifications are working perfectly! You\'ll receive document reminders via Despia.',
          data: {
            type: 'test',
            date: '2025-11-04'
          }
        }
      });

      if (error) {
        throw error;
      }

      setResult({
        success: data.success,
        message: data.success 
          ? 'Test OneSignal notification sent! Check your Despia mobile app.' 
          : data.error || 'Failed to send notification'
      });
    } catch (error) {
      console.error('Error testing OneSignal notification:', error);
      setResult({
        success: false,
        message: 'Error: ' + (error as Error).message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto p-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/settings')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Settings
        </Button>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Test OneSignal Push Notifications</h1>
            <p className="text-muted-foreground mt-2">
              Test OneSignal integration with Despia SDK for your mobile app
            </p>
          </div>

          {isRegistered && playerId && (
            <Alert>
              <Smartphone className="h-4 w-4" />
              <AlertDescription>
                Your device is registered! Player ID: {playerId.substring(0, 20)}...
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Step 1: Register OneSignal Player ID</CardTitle>
              <CardDescription>
                The Despia SDK automatically provides your OneSignal Player ID. You can also register it manually here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="playerId">OneSignal Player ID</Label>
                <Input
                  id="playerId"
                  placeholder="Enter your OneSignal Player ID from Despia app"
                  value={manualPlayerId}
                  onChange={(e) => setManualPlayerId(e.target.value)}
                  disabled={registeringPlayerId}
                />
                <p className="text-xs text-muted-foreground">
                  In your Despia app, the Player ID is automatically available via despia.onesignalplayerid
                </p>
              </div>
              
              <Button 
                onClick={handleRegisterPlayerId} 
                disabled={registeringPlayerId || !manualPlayerId.trim()}
                className="w-full"
              >
                {registeringPlayerId ? 'Registering...' : 'Register Player ID'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 2: Send Test Notification</CardTitle>
              <CardDescription>
                Once your Player ID is registered, send a test push notification to your Despia mobile app
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Bell className="h-4 w-4" />
                <AlertDescription>
                  This will send a test push notification via OneSignal to your Despia app
                </AlertDescription>
              </Alert>

              <Button 
                onClick={handleTestNotification} 
                disabled={loading || !user}
                className="w-full"
              >
                {loading ? 'Sending...' : 'Send Test OneSignal Notification'}
              </Button>

              {result && (
                <Alert variant={result.success ? 'default' : 'destructive'}>
                  {result.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>{result.message}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How OneSignal + Despia Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. Your Despia app is connected to OneSignal for push notifications</p>
              <p>2. The Despia SDK provides the OneSignal Player ID via despia.onesignalplayerid</p>
              <p>3. When you register your Player ID, it's stored in our database</p>
              <p>4. Our system sends push notifications to all registered devices via OneSignal</p>
              <p>5. You'll receive notifications for document expiry reminders</p>
              <p className="pt-2 font-medium text-foreground">
                💡 Tip: Make sure push notifications are enabled in your phone settings and OneSignal is properly configured
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
