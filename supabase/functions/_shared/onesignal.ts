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

export type OneSignalReason =
  | 'sent'
  | 'missing_credentials'
  | 'no_registered_device'
  | 'lookup_failed'
  | 'onesignal_rejected'
  | 'no_subscribed_recipients'
  | 'timeout'
  | 'exception';

export interface OneSignalResult {
  success: boolean;
  reason: OneSignalReason;
  recipients: number;
  subscriptionIds: string[];
  notificationId?: string;
  status?: number;
  error?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the canonical OneSignal subscription IDs for a Supabase user.
 * The Supabase user_id is used ONLY as a lookup key and is never sent to OneSignal.
 */
export async function getOneSignalSubscriptionIds(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ids: string[]; error?: string }> {
  const [tokenResult, playerResult] = await Promise.all([
    supabase
      .from('notification_tokens')
      .select('token')
      .eq('user_id', userId)
      .eq('provider', 'onesignal'),
    supabase
      .from('onesignal_player_ids')
      .select('player_id')
      .eq('user_id', userId),
  ]);

  const lookupError = tokenResult.error?.message || playerResult.error?.message;

  const raw: string[] = [
    ...(tokenResult.data ?? []).map((t: { token: string }) => t.token),
    ...(playerResult.data ?? []).map((p: { player_id: string }) => p.player_id),
  ];

  const ids = [...new Set(raw)]
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .map((id) => id.trim())
    // Never send the Supabase user_id itself, and only accept OneSignal UUIDs.
    .filter((id) => id !== userId && UUID_RE.test(id));

  return { ids, error: lookupError };
}

/**
 * Send a push notification via OneSignal and return full delivery diagnostics.
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
      return {
        success: false,
        reason: 'missing_credentials',
        recipients: 0,
        subscriptionIds: [],
        error: 'ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY is not set',
      };
    }

    console.log(`[ONESIGNAL] Lookup for authenticated user_id=${payload.userId}`);
    const { ids: subscriptionIds, error: lookupError } =
      await getOneSignalSubscriptionIds(supabase, payload.userId);

    if (lookupError) {
      console.error('[ONESIGNAL] Subscription lookup failed:', lookupError);
      return {
        success: false,
        reason: 'lookup_failed',
        recipients: 0,
        subscriptionIds: [],
        error: lookupError,
      };
    }

    console.log(
      `[ONESIGNAL] Found ${subscriptionIds.length} subscription id(s): ${
        subscriptionIds.join(', ') || '(none)'
      }`
    );

    if (subscriptionIds.length === 0) {
      return {
        success: false,
        reason: 'no_registered_device',
        recipients: 0,
        subscriptionIds: [],
        error: 'No OneSignal subscription IDs registered for this user',
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ONESIGNAL_TIMEOUT_MS);

    const oneSignalMessage: Record<string, unknown> = {
      app_id: appId,
      include_subscription_ids: subscriptionIds,
      headings: { en: payload.title },
      contents: { en: payload.message },
      data: payload.data || {},
    };

    if (payload.buttons && payload.buttons.length > 0) {
      oneSignalMessage.buttons = payload.buttons;
      oneSignalMessage.ios_category = 'REMINDER_ACTIONS';
    }

    if (payload.url) {
      oneSignalMessage.url = payload.url;
    }

    let response: Response;
    try {
      response = await fetch(ONESIGNAL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${apiKey.trim()}`,
        },
        body: JSON.stringify(oneSignalMessage),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const rawBody = await response.text();
    let result: Record<string, unknown> = {};
    try {
      result = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      result = {};
    }

    if (!response.ok) {
      console.error('[ONESIGNAL] API error', response.status, rawBody);
      return {
        success: false,
        reason: 'onesignal_rejected',
        recipients: 0,
        subscriptionIds,
        status: response.status,
        error:
          (Array.isArray(result.errors) ? result.errors.join(', ') : undefined) ||
          rawBody ||
          `OneSignal returned ${response.status}`,
      };
    }

    const recipients = Number(result.recipients ?? 0);
    const notificationId = typeof result.id === 'string' ? result.id : undefined;
    const apiErrors = (result as { errors?: unknown }).errors;

    console.log(
      `[ONESIGNAL] Accepted id=${notificationId ?? 'none'} recipients=${recipients}`
    );

    if (!notificationId || recipients === 0) {
      return {
        success: false,
        reason: 'no_subscribed_recipients',
        recipients,
        subscriptionIds,
        notificationId,
        status: response.status,
        error:
          typeof apiErrors === 'object' && apiErrors !== null
            ? JSON.stringify(apiErrors)
            : 'OneSignal accepted the request but no subscribed devices matched',
      };
    }

    return {
      success: true,
      reason: 'sent',
      recipients,
      subscriptionIds,
      notificationId,
      status: response.status,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[ONESIGNAL] Request timeout');
      return {
        success: false,
        reason: 'timeout',
        recipients: 0,
        subscriptionIds: [],
        error: 'OneSignal request timed out',
      };
    }
    console.error('[ONESIGNAL] Exception:', error);
    return {
      success: false,
      reason: 'exception',
      recipients: 0,
      subscriptionIds: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Boolean wrapper kept for existing callers.
 */
export async function sendOneSignalNotification(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<boolean> {
  const result = await sendOneSignalNotificationDetailed(supabase, payload);
  return result.success;
}
