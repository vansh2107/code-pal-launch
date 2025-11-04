import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Bell, CheckCircle, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFCMToken } from '@/hooks/useFCMToken';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TestPushNotification() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { registerToken } = useFCMToken();
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fcmToken, setFcmToken] = useState('');
  const [registeringToken, setRegisteringToken] = useState(false);

  const handleRegisterToken = async () => {
    if (!fcmToken.trim()) {
      setResult({
        success: false,
        message: 'Please enter a valid FCM token'
      });
      return;
    }

    setRegisteringToken(true);
    setResult(null);

    try {
      const success = await registerToken(fcmToken, 'AppMySite Mobile App');
      
      if (success) {
        setResult({
          success: true,
          message: 'FCM token registered successfully! Now you can test push notifications.'
        });
        setFcmToken('');
      } else {
        setResult({
          success: false,
          message: 'Failed to register FCM token. Please try again.'
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Error registering token: ' + (error as Error).message
      });
    } finally {
      setRegisteringToken(false);
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
      const { data, error } = await supabase.functions.invoke('test-push-notification');

      if (error) {
        throw error;
      }

      setResult({
        success: data.success,
        message: data.success 
          ? 'Test push notification sent! Check your mobile device.' 
          : data.error || 'Failed to send notification'
      });
    } catch (error) {
      console.error('Error testing push notification:', error);
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
            <h1 className="text-3xl font-bold">Test Push Notifications</h1>
            <p className="text-muted-foreground mt-2">
              Test Firebase Cloud Messaging integration for your mobile app
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Step 1: Register FCM Token</CardTitle>
              <CardDescription>
                First, you need to register your device's FCM token. Get this from your AppMySite mobile app's Firebase integration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fcmToken">FCM Device Token</Label>
                <Input
                  id="fcmToken"
                  placeholder="Enter your FCM token from Firebase"
                  value={fcmToken}
                  onChange={(e) => setFcmToken(e.target.value)}
                  disabled={registeringToken}
                />
                <p className="text-xs text-muted-foreground">
                  In your AppMySite app, go to Firebase settings and copy your device token
                </p>
              </div>
              
              <Button 
                onClick={handleRegisterToken} 
                disabled={registeringToken || !fcmToken.trim()}
                className="w-full"
              >
                {registeringToken ? 'Registering...' : 'Register Token'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step 2: Send Test Notification</CardTitle>
              <CardDescription>
                Once your token is registered, send a test push notification to your device
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Bell className="h-4 w-4" />
                <AlertDescription>
                  This will send a test push notification for your November 4, 2025 reminder
                </AlertDescription>
              </Alert>

              <Button 
                onClick={handleTestNotification} 
                disabled={loading || !user}
                className="w-full"
              >
                {loading ? 'Sending...' : 'Send Test Push Notification'}
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
              <CardTitle>How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. Your AppMySite app is connected to Firebase</p>
              <p>2. When you register your FCM token, it's stored in our database</p>
              <p>3. Our system sends push notifications to all registered devices</p>
              <p>4. You'll receive notifications for document expiry reminders</p>
              <p className="pt-2 font-medium text-foreground">
                💡 Tip: Make sure push notifications are enabled in your phone settings
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
