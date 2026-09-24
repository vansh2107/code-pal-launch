/**
 * src/utils/notifications.ts — Firebase-backed notification utilities
 *
 * Replaces Supabase calls with Firebase Cloud Functions.
 * Public API is identical so all consumers compile unchanged.
 *
 * Changes:
 *   sendTestNotification():
 *     - supabase.auth.getUser()          → firebaseAuth.currentUser
 *     - supabase.functions.invoke(...)   → httpsCallable(firebaseFunctions, 'testPushNotification')
 */

import { httpsCallable } from 'firebase/functions';
import { firebaseAuth, firebaseFunctions } from '@/integrations/firebase/client';

export interface NotificationToken {
  token:       string;
  provider:    'fcm' | 'onesignal' | 'capacitor';
  device_info?: string;
}

export interface NotificationPayload {
  title: string;
  body:  string;
  data?: Record<string, unknown>;
}

// Unified notification callback (kept for API compatibility)
let notificationCallback: ((payload: NotificationPayload) => void) | null = null;

export function setNotificationCallback(callback: (payload: NotificationPayload) => void) {
  notificationCallback = callback;
}

/**
 * Request Web notification permission.
 * Unchanged — no backend dependency.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      return (await Notification.requestPermission()) === 'granted';
    }
    return false;
  } catch (error) {
    console.error('[notifications] requestNotificationPermission error:', error);
    return false;
  }
}

/**
 * Initialize push notifications.
 * OneSignal handles native registration; this is a web-only fallback.
 * Unchanged — no backend dependency.
 */
export async function initializeNotifications(): Promise<void> {
  try {
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) console.warn('[notifications] Web notification permission denied');
  } catch (error) {
    console.error('[notifications] initializeNotifications error:', error);
  }
}

export interface TestNotificationResult {
  ok:      boolean;
  channel: 'push' | 'local' | 'none';
  message: string;
}

/**
 * Send a test notification via the Firebase `testPushNotification` Cloud Function.
 *
 * Falls back to a local browser notification if no push device is registered.
 *
 * Replaces:
 *   supabase.auth.getUser()              → firebaseAuth.currentUser
 *   supabase.functions.invoke(...)       → httpsCallable(firebaseFunctions, 'testPushNotification')
 */
export async function sendTestNotification(): Promise<TestNotificationResult> {
  try {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) {
      return { ok: false, channel: 'none', message: 'You need to be signed in.' };
    }

    const fn = httpsCallable<{ userId?: string }, { success: boolean; message?: string }>(
      firebaseFunctions,
      'testPushNotification',
    );
    const result = await fn({ userId: currentUser.uid });
    const data   = result.data;

    if (data.success) {
      return { ok: true, channel: 'push', message: 'Check your device for the push notification.' };
    }

    // No push device registered → fall back to local browser notification
    const granted = await requestNotificationPermission();
    if (granted) {
      new Notification('Remonk Reminder', {
        body: 'Test notification working 🎉 Push on this device uses your browser notifications.',
        icon: '/favicon.ico',
      });
      return {
        ok:      true,
        channel: 'local',
        message: 'Shown as a browser notification (no push-enabled device registered yet).',
      };
    }

    return {
      ok:      false,
      channel: 'none',
      message: 'Allow notifications in your browser, or open the mobile app to receive push notifications.',
    };
  } catch (error) {
    console.error('[notifications] sendTestNotification error:', error);
    return { ok: false, channel: 'none', message: 'Something went wrong sending the test.' };
  }
}
