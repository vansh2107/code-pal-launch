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
 * Initialize notifications - simplified entry point for Capacitor + Web
 */
export async function initializeNotifications(): Promise<void> {
  try {
    console.log('Initializing push notifications (OneSignal handles native registration)...');

    // Web fallback: Request permission
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.warn('Web notification permission denied');
      return;
    }
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
}

export interface TestNotificationResult {
  ok: boolean;
  channel: 'push' | 'local' | 'none';
  message: string;
}

/**
 * Send a test notification.
 * Tries a real push via the backend first; if the account has no registered
 * push device (typical on web), falls back to a local browser notification.
 */
export async function sendTestNotification(): Promise<TestNotificationResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, channel: 'none', message: 'You need to be signed in.' };
    }

    const { data, error } = await supabase.functions.invoke('test-push-notification', {
      body: { userId: user.id },
    });

    if (error) {
      console.error('Failed to send test notification:', error);
      return { ok: false, channel: 'none', message: 'Notification service is unavailable right now.' };
    }

    if (data?.delivered) {
      return { ok: true, channel: 'push', message: 'Check your device for the push notification.' };
    }

    // No push device registered → show a local notification so the test is still useful
    const granted = await requestNotificationPermission();
    if (granted) {
      new Notification('Remonk Reminder', {
        body: 'Test notification working 🎉 Push on this device uses your browser notifications.',
        icon: '/favicon.ico',
      });
      return {
        ok: true,
        channel: 'local',
        message: 'Shown as a browser notification (no push-enabled device registered yet).',
      };
    }

    return {
      ok: false,
      channel: 'none',
      message: 'Allow notifications in your browser, or open the mobile app to receive push notifications.',
    };
  } catch (error) {
    console.error('Error sending test notification:', error);
    return { ok: false, channel: 'none', message: 'Something went wrong sending the test.' };
  }
}

