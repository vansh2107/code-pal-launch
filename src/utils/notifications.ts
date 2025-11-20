import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Request notification permission from the user
 * Works in both web and native contexts
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      console.log('Notification permission already granted');
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
}

/**
 * Get FCM token from Firebase
 * Note: This requires Firebase SDK to be initialized
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    // Check if we're in a Capacitor native environment
    if ((window as any).FirebaseMessaging) {
      const fcm = (window as any).FirebaseMessaging;
      const token = await fcm.getToken();
      return token;
    }

    // For web, check if we have FCM token in Android native layer
    if ((window as any).Android?.getFCMToken) {
      const token = await (window as any).Android.getFCMToken();
      return token;
    }

    console.log('FCM not available in this environment');
    return null;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

/**
 * Get OneSignal player ID
 */
export async function getOneSignalPlayerId(): Promise<string | null> {
  try {
    // Check if OneSignal is available globally
    if ((window as any).OneSignalPlayerId) {
      return (window as any).OneSignalPlayerId;
    }

    // Check if despia native SDK is available
    if ((window as any).despia?.onesignalplayerid) {
      return (window as any).despia.onesignalplayerid;
    }

    console.log('OneSignal player ID not available yet');
    return null;
  } catch (error) {
    console.error('Error getting OneSignal player ID:', error);
    return null;
  }
}

/**
 * Register notification token with backend
 */
export async function registerTokenWithBackend(
  token: string,
  provider: 'fcm' | 'onesignal'
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('User not authenticated');
      return false;
    }

    // Call the edge function to register the token
    const { data, error } = await supabase.functions.invoke('update-notification-token', {
      body: {
        token,
        provider,
        device_info: navigator.userAgent,
      }
    });

    if (error) {
      console.error(`Error registering ${provider} token:`, error);
      toast({
        title: 'Notification Setup Failed',
        description: `Could not register ${provider} token. Please try again.`,
        variant: 'destructive',
      });
      return false;
    }

    console.log(`${provider} token registered successfully`);
    toast({
      title: 'Notifications Enabled',
      description: `You'll receive push notifications via ${provider.toUpperCase()}`,
    });
    
    return true;
  } catch (error) {
    console.error(`Exception registering ${provider} token:`, error);
    return false;
  }
}

/**
 * Initialize and register push notifications
 * Call this after user login or on app startup
 */
export async function initializePushNotifications(): Promise<void> {
  try {
    // Request permission first
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.log('Notification permission not granted');
      return;
    }

    // Try to get and register FCM token
    const fcmToken = await getFCMToken();
    if (fcmToken) {
      await registerTokenWithBackend(fcmToken, 'fcm');
      return;
    }

    // Fall back to OneSignal
    const oneSignalId = await getOneSignalPlayerId();
    if (oneSignalId) {
      await registerTokenWithBackend(oneSignalId, 'onesignal');
      return;
    }

    console.log('No notification provider available');
  } catch (error) {
    console.error('Error initializing push notifications:', error);
  }
}

/**
 * Check and re-register tokens periodically
 * Call this on app resume or periodically
 */
export async function refreshNotificationTokens(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check existing tokens
    const { data: existingTokens } = await supabase
      .from('notification_tokens')
      .select('provider, token')
      .eq('user_id', user.id);

    const hasFCM = existingTokens?.some(t => t.provider === 'fcm');
    const hasOneSignal = existingTokens?.some(t => t.provider === 'onesignal');

    // Try to register missing providers
    if (!hasFCM) {
      const fcmToken = await getFCMToken();
      if (fcmToken) {
        await registerTokenWithBackend(fcmToken, 'fcm');
      }
    }

    if (!hasOneSignal) {
      const oneSignalId = await getOneSignalPlayerId();
      if (oneSignalId) {
        await registerTokenWithBackend(oneSignalId, 'onesignal');
      }
    }
  } catch (error) {
    console.error('Error refreshing notification tokens:', error);
  }
}
