import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';
const FCM_TIMEOUT_MS = 10000;

interface FCMPayload {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
}

/**
 * Send push notification via Firebase Cloud Messaging
 */
export async function sendFCMNotification(
  supabase: SupabaseClient,
  payload: FCMPayload
): Promise<boolean> {
  try {
    const serverKey = Deno.env.get('FIREBASE_SERVER_KEY');
    if (!serverKey) {
      console.error('FIREBASE_SERVER_KEY not configured');
      return false;
    }

    // Fetch FCM tokens for the user
    const { data: tokens, error: fetchError } = await supabase
      .from('notification_tokens')
      .select('token')
      .eq('user_id', payload.userId)
      .eq('provider', 'fcm');

    if (fetchError || !tokens || tokens.length === 0) {
      console.log(`No FCM tokens found for user ${payload.userId}`);
      return false;
    }

    const fcmTokens = tokens.map(t => t.token);
    console.log(`Sending FCM notification to ${fcmTokens.length} device(s)`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FCM_TIMEOUT_MS);

    const fcmMessage = {
      registration_ids: fcmTokens,
      notification: {
        title: payload.title,
        body: payload.message,
        sound: 'default',
        priority: 'high',
      },
      data: payload.data || {},
    };

    const response = await fetch(FCM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${serverKey}`,
      },
      body: JSON.stringify(fcmMessage),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('FCM notification failed:', response.status, errorText);
      return false;
    }

    const result = await response.json();
    console.log('FCM notification result:', result);

    // Handle invalid tokens
    if (result.results) {
      for (let i = 0; i < result.results.length; i++) {
        const res = result.results[i];
        if (res.error === 'InvalidRegistration' || res.error === 'NotRegistered') {
          // Remove invalid token
          const invalidToken = fcmTokens[i];
          await supabase
            .from('notification_tokens')
            .delete()
            .eq('user_id', payload.userId)
            .eq('token', invalidToken)
            .eq('provider', 'fcm');
          console.log(`Removed invalid FCM token: ${invalidToken}`);
        }
      }
    }

    return result.success > 0;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('FCM notification timeout');
    } else {
      console.error('FCM notification exception:', error);
    }
    return false;
  }
}
