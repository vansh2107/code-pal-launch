import { supabase } from '@/integrations/supabase/client';

export interface NotificationToken {
  token: string;
  provider: 'fcm' | 'onesignal';
  device_info?: string;
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
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
 * Get FCM token (for web push notifications)
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    // Web push notifications can be implemented using service workers
    // This is a placeholder for Firebase Web SDK integration
    console.log('FCM token retrieval - implement Firebase Web SDK if needed');
    return null;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

/**
 * Get OneSignal player ID from Despia native environment
 */
export async function getOneSignalToken(): Promise<string | null> {
  try {
    // Check if we're in Despia native environment
    if (typeof window !== 'undefined' && (window as any).despia) {
      const playerId = (window as any).despia.onesignalplayerid;
      if (playerId && playerId !== 'NOT_SET') {
        return playerId;
      }
    }
    return null;
  } catch (error) {
    console.error('Error getting OneSignal token:', error);
    return null;
  }
}

/**
 * Register notification token with backend
 */
export async function registerTokenWithBackend(
  tokenData: NotificationToken
): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.error('No active session, cannot register token');
      return false;
    }

    const { data, error } = await supabase.functions.invoke('update-notification-token', {
      body: tokenData,
    });

    if (error) {
      console.error('Failed to register notification token:', error);
      return false;
    }

    console.log(`Successfully registered ${tokenData.provider} token with backend`);
    return true;
  } catch (error) {
    console.error('Error registering token with backend:', error);
    return false;
  }
}

/**
 * Initialize notifications - request permission and register tokens
 */
export async function initializeNotifications(): Promise<void> {
  try {
    console.log('Initializing push notifications...');

    // Request permission
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.warn('Notification permission denied');
      return;
    }

    // Try to get OneSignal token first (for native apps)
    const oneSignalToken = await getOneSignalToken();
    if (oneSignalToken) {
      await registerTokenWithBackend({
        token: oneSignalToken,
        provider: 'onesignal',
        device_info: navigator.userAgent,
      });
      console.log('OneSignal token registered successfully');
      return;
    }

    // Fallback to FCM for web
    const fcmToken = await getFCMToken();
    if (fcmToken) {
      await registerTokenWithBackend({
        token: fcmToken,
        provider: 'fcm',
        device_info: navigator.userAgent,
      });
      console.log('FCM token registered successfully');
    }
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
}

/**
 * Send a test notification
 */
export async function sendTestNotification(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('test-push-notification');

    if (error) {
      console.error('Failed to send test notification:', error);
      return false;
    }

    console.log('Test notification sent:', data);
    return true;
  } catch (error) {
    console.error('Error sending test notification:', error);
    return false;
  }
}
