import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface PushPayload {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
}

/**
 * Send push notification via FCM
 */
async function sendFCMNotification(
  token: string,
  title: string,
  message: string,
  data?: Record<string, string>
): Promise<boolean> {
  try {
    const serverKey = Deno.env.get('FIREBASE_SERVER_KEY');
    if (!serverKey) {
      console.error('FIREBASE_SERVER_KEY not configured');
      return false;
    }

    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: title,
          body: message,
          sound: 'default',
          priority: 'high',
        },
        data: data || {},
      }),
    });

    if (!response.ok) {
      console.error('FCM notification failed:', await response.text());
      return false;
    }

    console.log('FCM notification sent successfully');
    return true;
  } catch (error) {
    console.error('FCM notification error:', error);
    return false;
  }
}

/**
 * Send push notification via OneSignal
 */
async function sendOneSignalNotification(
  playerId: string,
  title: string,
  message: string,
  data?: Record<string, string>
): Promise<boolean> {
  try {
    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!appId || !restApiKey) {
      console.error('OneSignal credentials not configured');
      return false;
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${restApiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_player_ids: [playerId],
        headings: { en: title },
        contents: { en: message },
        data: data || {},
      }),
    });

    if (!response.ok) {
      console.error('OneSignal notification failed:', await response.text());
      return false;
    }

    console.log('OneSignal notification sent successfully');
    return true;
  } catch (error) {
    console.error('OneSignal notification error:', error);
    return false;
  }
}

/**
 * Send push notification to a user via all available providers
 * Automatically detects and uses FCM or OneSignal based on user's registered tokens
 */
export async function sendPushNotificationToUser(
  supabase: SupabaseClient,
  payload: PushPayload
): Promise<{ success: boolean; sentVia: string[] }> {
  const { userId, title, message, data } = payload;
  const sentVia: string[] = [];

  try {
    // Fetch all notification tokens for this user
    const { data: tokens, error } = await supabase
      .from('notification_tokens')
      .select('token, provider')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching notification tokens:', error);
      return { success: false, sentVia: [] };
    }

    if (!tokens || tokens.length === 0) {
      console.log(`No notification tokens found for user ${userId}`);
      return { success: false, sentVia: [] };
    }

    // Send notifications via all available providers
    const promises = tokens.map(async ({ token, provider }) => {
      if (provider === 'fcm') {
        const success = await sendFCMNotification(token, title, message, data);
        if (success) sentVia.push('FCM');
        return success;
      } else if (provider === 'onesignal') {
        const success = await sendOneSignalNotification(token, title, message, data);
        if (success) sentVia.push('OneSignal');
        return success;
      }
      return false;
    });

    const results = await Promise.all(promises);
    const anySuccess = results.some(r => r);

    return {
      success: anySuccess,
      sentVia: [...new Set(sentVia)], // Remove duplicates
    };
  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, sentVia: [] };
  }
}

/**
 * Send push notification to multiple users
 */
export async function sendBulkPushNotifications(
  supabase: SupabaseClient,
  userIds: string[],
  title: string,
  message: string,
  data?: Record<string, string>
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    const result = await sendPushNotificationToUser(supabase, {
      userId,
      title,
      message,
      data,
    });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}
