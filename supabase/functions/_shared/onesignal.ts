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

/**
 * Send push notification via OneSignal
 */
export async function sendOneSignalNotification(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<boolean> {
  try {
    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!appId || !apiKey) {
      console.error('OneSignal credentials not configured');
      return false;
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
      return false;
    }

    console.log(`Sending OneSignal notification to ${uniquePlayerIds.length} device(s)`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ONESIGNAL_TIMEOUT_MS);

    const oneSignalMessage: Record<string, unknown> = {
      app_id: appId,
      include_player_ids: uniquePlayerIds,
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
      return false;
    }

    const result = await response.json();
    console.log('OneSignal notification result:', result);

    return result.id !== undefined;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('OneSignal notification timeout');
    } else {
      console.error('OneSignal notification exception:', error);
    }
    return false;
  }
}
