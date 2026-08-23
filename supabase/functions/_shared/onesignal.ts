import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';
const ONESIGNAL_TIMEOUT_MS = 10000;

// OneSignal subscription (player) IDs are UUIDs. The Supabase auth user_id
// must NEVER be sent to OneSignal — it is only used to look up player_ids.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  userId: string;
  playerIds: string[];
  recipients: number;
  notificationId?: string;
  status?: number;
  error?: string;
}

/**
 * Resolve the OneSignal subscription IDs for a Supabase user.
 * The user_id is used ONLY to query public.onesignal_player_ids.
 */
export async function getPlayerIdsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ playerIds: string[]; error?: string }> {
  const { data, error } = await supabase
    .from('onesignal_player_ids')
    .select('player_id')
    .eq('user_id', userId);

  if (error) {
    console.error(`[OneSignal] onesignal_player_ids lookup failed for user ${userId}:`, error.message);
    return { playerIds: [], error: `DB lookup failed: ${error.message}` };
  }

  const playerIds = [...new Set(
    (data ?? [])
      .map((row) => row.player_id)
      .filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
  )];

  return { playerIds };
}

/**
 * Send a push notification via OneSignal.
 *
 * Flow: authenticated Supabase user_id → lookup player_ids in
 * public.onesignal_player_ids → send to OneSignal with
 * include_subscription_ids = those player_ids. The user_id itself is
 * never included in the OneSignal payload.
 */
export async function sendOneSignalNotificationDetailed(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<OneSignalSendResult> {
  const base: OneSignalSendResult = {
    success: false,
    userId: payload.userId,
    playerIds: [],
    recipients: 0,
  };

  try {
    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!appId || !apiKey) {
      console.error('[OneSignal] ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY not configured');
      return { ...base, error: 'OneSignal credentials not configured' };
    }

    console.log(`[OneSignal] Authenticated user_id: ${payload.userId}`);

    const { playerIds, error: lookupError } = await getPlayerIdsForUser(supabase, payload.userId);
    if (lookupError) {
      return { ...base, error: lookupError };
    }

    console.log(`[OneSignal] Found ${playerIds.length} subscription ID(s) for user ${payload.userId}`);
    console.log(`[OneSignal] Sending to subscription IDs: ${JSON.stringify(playerIds)}`);

    if (playerIds.length === 0) {
      console.warn(`[OneSignal] No subscription IDs registered for user ${payload.userId} — nothing to send`);
      return { ...base, error: 'no_registered_device' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ONESIGNAL_TIMEOUT_MS);

    const oneSignalMessage: Record<string, unknown> = {
      app_id: appId,
      include_subscription_ids: playerIds,
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

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorText = result?.errors ? JSON.stringify(result.errors) : JSON.stringify(result);
      console.error(`[OneSignal] API error (status ${response.status}):`, errorText);
      return {
        ...base,
        playerIds,
        status: response.status,
        error: `OneSignal API ${response.status}: ${errorText}`,
      };
    }

    const recipients = typeof result.recipients === 'number' ? result.recipients : 0;
    console.log(`[OneSignal] API response: id=${result.id ?? 'n/a'} recipients=${recipients} status=${response.status}`);

    if (recipients === 0) {
      console.warn('[OneSignal] Notification accepted but 0 recipients — subscription(s) may be unsubscribed or invalid');
    }

    return {
      success: result.id !== undefined,
      userId: payload.userId,
      playerIds,
      recipients,
      notificationId: result.id,
      status: response.status,
      ...(recipients === 0 ? { error: 'accepted_but_zero_recipients' } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[OneSignal] Request timeout');
      return { ...base, error: 'OneSignal request timeout' };
    }
    console.error('[OneSignal] Exception:', error);
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Boolean wrapper kept for existing callers (reminder schedulers, etc.).
 */
export async function sendOneSignalNotification(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<boolean> {
  const result = await sendOneSignalNotificationDetailed(supabase, payload);
  return result.success;
}
