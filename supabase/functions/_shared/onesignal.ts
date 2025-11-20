import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';
const ONESIGNAL_TIMEOUT_MS = 10000;

interface OneSignalPayload {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
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

    const oneSignalMessage = {
      app_id: appId,
      include_player_ids: uniquePlayerIds,
      headings: { en: payload.title },
      contents: { en: payload.message },
      data: payload.data || {},
    };

    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
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
