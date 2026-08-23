import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';
const ONESIGNAL_TIMEOUT_MS = 10000;

interface OneSignalPayload {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
  buttons?: { id: string; text: string; icon?: string }[];
  url?: string;
}

export interface OneSignalSendResult {
  delivered: boolean;
  reason: 'sent' | 'no_registered_device' | 'credentials_missing' | 'database_error' | 'provider_rejected' | 'timeout' | 'unexpected_error';
  recipients: number;
  message: string;
  providerStatus?: number;
  providerId?: string;
}

/**
 * Send push notification via OneSignal
 */
export async function sendOneSignalNotification(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<boolean> {
  const result = await sendOneSignalNotificationDetailed(supabase, payload);
  return result.delivered;
}

export async function sendOneSignalNotificationDetailed(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<OneSignalSendResult> {
  try {
    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!appId || !apiKey) {
      console.error('OneSignal credentials not configured');
      return { delivered: false, reason: 'credentials_missing', recipients: 0, message: 'OneSignal credentials are not configured.' };
    }

    // Fetch OneSignal player IDs for the user from both tables
    const [tokenResult, playerResult] = await Promise.all([
      supabase
        .from('notification_tokens')
        .select('token')
        .eq('user_id', payload.userId)
        .eq('provider', 'onesignal'),
      supabase
        .from('onesignal_player_ids')
        .select('player_id')
        .eq('user_id', payload.userId)
    ]);

    if (tokenResult.error || playerResult.error) {
      const message = tokenResult.error?.message || playerResult.error?.message || 'Could not read registered devices.';
      console.error('OneSignal device lookup failed:', message);
      return { delivered: false, reason: 'database_error', recipients: 0, message };
    }

    const playerIds: string[] = [];
    
    if (tokenResult.data && tokenResult.data.length > 0) {
      playerIds.push(...tokenResult.data.map(t => t.token));
    }
    
    if (playerResult.data && playerResult.data.length > 0) {
      playerIds.push(...playerResult.data.map(p => p.player_id));
    }

    // Remove duplicates
    const uniquePlayerIds = [...new Set(playerIds)];

    if (uniquePlayerIds.length === 0) {
      console.log(`No OneSignal player IDs found for user ${payload.userId}`);
      return { delivered: false, reason: 'no_registered_device', recipients: 0, message: 'No push-enabled device is registered for this account.' };
    }

    console.log(`Sending OneSignal notification to ${uniquePlayerIds.length} device(s)`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ONESIGNAL_TIMEOUT_MS);

    const oneSignalMessage: Record<string, unknown> = {
      app_id: appId,
      include_subscription_ids: uniquePlayerIds,
      headings: { en: payload.title },
      contents: { en: payload.message },
      data: payload.data || {},
    };

    if (payload.buttons && payload.buttons.length > 0) {
      // Android-style buttons
      oneSignalMessage.buttons = payload.buttons;
      // iOS category — apps can register matching category for buttons
      oneSignalMessage.ios_category = 'REMINDER_ACTIONS';
    }

    if (payload.url) {
      oneSignalMessage.url = payload.url;
    }

    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKey.trim()}`,
      },
      body: JSON.stringify(oneSignalMessage),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OneSignal notification failed:', response.status, errorText);
      return { delivered: false, reason: 'provider_rejected', recipients: 0, message: `OneSignal rejected the notification: ${errorText}`, providerStatus: response.status };
    }

    const result = await response.json();
    console.log('OneSignal notification result:', result);

    const recipients = typeof result.recipients === 'number' ? result.recipients : 0;
    if (!result.id || recipients === 0) {
      return { delivered: false, reason: 'provider_rejected', recipients, message: 'OneSignal accepted the request but did not deliver it to any subscribed device.', providerId: result.id };
    }
    return { delivered: true, reason: 'sent', recipients, message: 'Push notification sent.', providerId: result.id };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('OneSignal notification timeout');
      return { delivered: false, reason: 'timeout', recipients: 0, message: 'OneSignal timed out.' };
    } else {
      console.error('OneSignal notification exception:', error);
      return { delivered: false, reason: 'unexpected_error', recipients: 0, message: error instanceof Error ? error.message : 'Unexpected OneSignal error.' };
    }
  }
}
