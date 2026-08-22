import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';
const ONESIGNAL_TIMEOUT_MS = 10000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OneSignalPayload {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
  buttons?: { id: string; text: string; icon?: string }[];
  url?: string;
}

export interface OneSignalResult {
  success: boolean;
  /** machine readable reason when success === false */
  reason?:
    | 'not_configured'
    | 'no_subscriptions'
    | 'onesignal_error'
    | 'no_recipients'
    | 'timeout'
    | 'exception';
  /** human readable detail coming straight from OneSignal when available */
  detail?: string;
  status?: number;
  notificationId?: string;
  recipients?: number;
  targeted?: number;
  invalidIds?: string[];
  body?: unknown;
}

/** Remove subscription IDs that OneSignal reported as invalid. */
async function pruneInvalidIds(
  supabase: SupabaseClient,
  userId: string,
  invalidIds: string[]
) {
  if (invalidIds.length === 0) return;
  console.log('[ONESIGNAL] Pruning invalid subscription IDs:', invalidIds);
  try {
    await Promise.all([
      supabase
        .from('onesignal_player_ids')
        .delete()
        .eq('user_id', userId)
        .in('player_id', invalidIds),
      supabase
        .from('notification_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'onesignal')
        .in('token', invalidIds),
    ]);
  } catch (e) {
    console.error('[ONESIGNAL] Failed to prune invalid ids:', e);
  }
}

/**
 * Send push notification via OneSignal. Returns a detailed result — an HTTP 200
 * from OneSignal is NOT treated as success unless at least one recipient was
 * actually accepted.
 */
export async function sendOneSignalNotificationDetailed(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<OneSignalResult> {
  try {
    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!appId || !apiKey) {
      console.error('[ONESIGNAL] Credentials not configured');
      return { success: false, reason: 'not_configured', detail: 'OneSignal credentials not configured' };
    }

    const [tokenResult, playerResult] = await Promise.all([
      supabase
        .from('notification_tokens')
        .select('token')
        .eq('user_id', payload.userId)
        .eq('provider', 'onesignal'),
      supabase
        .from('onesignal_player_ids')
        .select('player_id')
        .eq('user_id', payload.userId),
    ]);

    const raw: string[] = [
      ...(tokenResult.data?.map((t: { token: string }) => t.token) ?? []),
      ...(playerResult.data?.map((p: { player_id: string }) => p.player_id) ?? []),
    ].filter(Boolean);

    // Only real OneSignal subscription IDs (UUIDs) may be targeted — an FCM
    // token must never be sent as a subscription id.
    const subscriptionIds = [...new Set(raw.map((v) => v.trim()))].filter((v) => UUID_RE.test(v));
    const rejected = [...new Set(raw)].filter((v) => !UUID_RE.test(v));
    if (rejected.length > 0) {
      console.log(`[ONESIGNAL] Ignoring ${rejected.length} non-subscription-id value(s)`);
    }

    if (subscriptionIds.length === 0) {
      console.log(`[ONESIGNAL] No subscription IDs for user ${payload.userId}`);
      return {
        success: false,
        reason: 'no_subscriptions',
        detail: 'No OneSignal subscription registered for this user/device',
        targeted: 0,
      };
    }

    const oneSignalMessage: Record<string, unknown> = {
      app_id: appId,
      target_channel: 'push',
      include_subscription_ids: subscriptionIds,
      headings: { en: payload.title },
      contents: { en: payload.message },
      data: payload.data || {},
    };

    if (payload.buttons && payload.buttons.length > 0) {
      oneSignalMessage.buttons = payload.buttons;
      oneSignalMessage.ios_category = 'REMINDER_ACTIONS';
    }
    if (payload.url) oneSignalMessage.url = payload.url;

    console.log(
      `[ONESIGNAL] Sending request to ${subscriptionIds.length} subscription(s) for user ${payload.userId}`
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ONESIGNAL_TIMEOUT_MS);

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

    const text = await response.text();
    console.log('[ONESIGNAL] HTTP status:', response.status);
    console.log('[ONESIGNAL] Response body:', text);

    let result: any = {};
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      result = { raw: text };
    }

    if (!response.ok) {
      const detail = Array.isArray(result?.errors)
        ? result.errors.join(', ')
        : JSON.stringify(result?.errors ?? result);
      console.error('[ONESIGNAL] Error:', response.status, detail);
      return {
        success: false,
        reason: 'onesignal_error',
        detail,
        status: response.status,
        body: result,
        targeted: subscriptionIds.length,
      };
    }

    const invalidIds: string[] = Array.isArray(result?.errors?.invalid_player_ids)
      ? result.errors.invalid_player_ids
      : Array.isArray(result?.errors?.invalid_external_user_ids)
        ? result.errors.invalid_external_user_ids
        : [];

    await pruneInvalidIds(supabase, payload.userId, invalidIds);

    // OneSignal sometimes omits `recipients`; derive it from what was targeted.
    const recipients =
      typeof result?.recipients === 'number'
        ? result.recipients
        : Math.max(subscriptionIds.length - invalidIds.length, 0);

    console.log('[ONESIGNAL] Notification ID:', result?.id ?? 'none');
    console.log('[ONESIGNAL] Recipients accepted:', recipients);

    if (!result?.id || recipients < 1) {
      const detail =
        invalidIds.length > 0
          ? `OneSignal rejected all ${invalidIds.length} subscription ID(s) as invalid. Reopen the mobile app to re-register this device.`
          : 'OneSignal accepted 0 recipients';
      console.error('[ONESIGNAL] Error:', detail);
      return {
        success: false,
        reason: 'no_recipients',
        detail,
        status: response.status,
        notificationId: result?.id,
        recipients: 0,
        targeted: subscriptionIds.length,
        invalidIds,
        body: result,
      };
    }

    return {
      success: true,
      status: response.status,
      notificationId: result.id,
      recipients,
      targeted: subscriptionIds.length,
      invalidIds,
      body: result,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[ONESIGNAL] Error: request timeout');
      return { success: false, reason: 'timeout', detail: 'OneSignal request timed out' };
    }
    console.error('[ONESIGNAL] Error:', error);
    return { success: false, reason: 'exception', detail: (error as Error).message };
  }
}

/** Backwards-compatible boolean wrapper. */
export async function sendOneSignalNotification(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<boolean> {
  const result = await sendOneSignalNotificationDetailed(supabase, payload);
  return result.success;
}
