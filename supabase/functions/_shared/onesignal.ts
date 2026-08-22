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
  success: boolean;
  /** Number of devices OneSignal accepted the notification for */
  recipients: number;
  /** OneSignal notification id when accepted */
  notificationId?: string;
  /** Human-readable failure reason (propagated from OneSignal when available) */
  error?: string;
  /** HTTP status from the OneSignal API, when a response was received */
  status?: number;
}

function fail(error: string, status?: number): OneSignalSendResult {
  return { success: false, recipients: 0, error, status };
}

/**
 * Send push notification via OneSignal, returning the full result
 * (recipient count + propagated OneSignal error) for diagnostics.
 */
export async function sendOneSignalNotificationDetailed(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<OneSignalSendResult> {
  try {
    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!appId || !apiKey) {
      console.error('OneSignal credentials not configured');
      return fail('OneSignal credentials not configured');
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
      return fail('No OneSignal player IDs registered for user');
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

      // Surface OneSignal's own error messages when present
      let message = `OneSignal API error (HTTP ${response.status})`;
      try {
        const parsed = JSON.parse(errorText);
        const errs = parsed?.errors;
        if (Array.isArray(errs) && errs.length > 0) {
          message = errs.map((e: unknown) => typeof e === 'string' ? e : JSON.stringify(e)).join('; ');
        } else if (typeof errs === 'string') {
          message = errs;
        }
      } catch {
        if (errorText) message = `${message}: ${errorText.slice(0, 300)}`;
      }
      return fail(message, response.status);
    }

    const result = await response.json();
    console.log('OneSignal notification result:', result);

    const recipients = typeof result.recipients === 'number' ? result.recipients : 0;

    if (result.id === undefined) {
      const errs = Array.isArray(result.errors) ? result.errors.join('; ') : undefined;
      return fail(errs || 'OneSignal did not accept the notification', response.status);
    }

    if (recipients === 0) {
      return {
        success: false,
        recipients: 0,
        notificationId: result.id,
        status: response.status,
        error: 'OneSignal accepted the request but 0 subscribed devices received it (player IDs may be unsubscribed or invalid)',
      };
    }

    return {
      success: true,
      recipients,
      notificationId: result.id,
      status: response.status,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('OneSignal notification timeout');
      return fail('OneSignal request timeout');
    }
    console.error('OneSignal notification exception:', error);
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Boolean wrapper kept for existing callers that only care about success.
 */
export async function sendOneSignalNotification(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<boolean> {
  const result = await sendOneSignalNotificationDetailed(supabase, payload);
  return result.success;
}
