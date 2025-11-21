import { supabase } from '@/integrations/supabase/client';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export interface NotificationToken {
  token: string;
  provider: 'fcm' | 'onesignal' | 'capacitor';
  device_info?: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

// Unified notification callback
let notificationCallback: ((payload: NotificationPayload) => void) | null = null;

export function setNotificationCallback(callback: (payload: NotificationPayload) => void) {
  notificationCallback = callback;
}

/**
 * Request notification permission from the user (Web)
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
 * Initialize Capacitor Push Notifications
 */
export async function initializeCapacitorPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('Not a native platform, skipping Capacitor push notifications');
    return;
  }

  try {
    console.log('Initializing Capacitor push notifications...');

    // Request permission
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('Push notification permission denied');
      return;
    }

    // Register with Apple / Google to receive push via APNS/FCM
    await PushNotifications.register();

    // Listen for registration success
    await PushNotifications.addListener('registration', async (token) => {
      console.log('Capacitor Push registration success, token: ' + token.value);
      
      await registerTokenWithBackend({
        token: token.value,
        provider: 'capacitor',
        device_info: Capacitor.getPlatform(),
      });
    });

    // Listen for registration errors
    await PushNotifications.addListener('registrationError', (error) => {
      console.error('Capacitor Push registration error: ', error);
    });

    // Listen for push notifications received
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received: ', notification);
      
      if (notificationCallback) {
        notificationCallback({
          title: notification.title || '',
          body: notification.body || '',
          data: notification.data,
        });
      }
    });

    // Listen for notification actions
    await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push notification action performed', notification);
      
      if (notificationCallback) {
        notificationCallback({
          title: notification.notification.title || '',
          body: notification.notification.body || '',
          data: notification.notification.data,
        });
      }
    });

    console.log('Capacitor push notifications initialized successfully');
  } catch (error) {
    console.error('Error initializing Capacitor push notifications:', error);
  }
}

/**
 * Initialize Despia Native Push Notifications
 */
export async function initializeDespiaPushNotifications(): Promise<void> {
  try {
    console.log('Initializing Despia Native push notifications...');

    // Check if we're in Despia native environment
    if (typeof window !== 'undefined' && (window as any).despia) {
      const despia = (window as any).despia;
      
      // Get OneSignal player ID from Despia
      const playerId = despia.onesignalplayerid;
      if (playerId && playerId !== 'NOT_SET') {
        console.log('Despia OneSignal Player ID:', playerId);
        
        await registerTokenWithBackend({
          token: playerId,
          provider: 'onesignal',
          device_info: 'Despia Native',
        });
        
        console.log('Despia push notifications initialized successfully');
      } else {
        console.log('Despia OneSignal Player ID not available yet');
      }
    } else {
      console.log('Not in Despia native environment');
    }
  } catch (error) {
    console.error('Error initializing Despia push notifications:', error);
  }
}

/**
 * Initialize notifications - unified entry point for Capacitor + Despia + Web
 */
export async function initializeNotifications(): Promise<void> {
  try {
    console.log('Initializing push notifications...');

    // Initialize Capacitor push notifications (for native Capacitor apps)
    await initializeCapacitorPushNotifications();

    // Initialize Despia push notifications (for Despia native wrapper)
    await initializeDespiaPushNotifications();

    // Web fallback: Request permission
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.warn('Web notification permission denied');
      return;
    }

    // Try to get OneSignal token (for web)
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
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return false;
    }

    // Try to get OneSignal player ID from localStorage (set by OneSignal in App.tsx)
    const playerId = localStorage.getItem('onesignal_player_id');
    
    console.log('Sending test notification to user:', user.id);
    console.log('OneSignal Player ID:', playerId || 'Not available');

    const { data, error } = await supabase.functions.invoke('test-push-notification', {
      body: { userId: user.id }
    });

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
