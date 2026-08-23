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

export interface OneSignalResult {
  success: boolean;
  target: 'subscription_ids' | 'external_id' | 'none';
  notificationId?: string;
  error?: string;
  raw?: unknown;
}

/** Collect stored OneSignal subscription (player) IDs for a user. */
export async function getSubscriptionIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
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

  const ids = [
    ...(tokenResult.data ?? []).map((t: { token: string }) => t.token),
    ...(playerResult.data ?? []).map((p: { player_id: string }) => p.player_id),
  ].filter(Boolean);

  return [...new Set(ids)];
}

async function postToOneSignal(
  body: Record<string, unknown>,
  apiKey: string
): Promise<{ ok: boolean; status: number; json: any }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ONESIGNAL_TIMEOUT_MS);
  try {
    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKey.trim()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let json: any = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

function hasNoRecipients(json: any): boolean {
  const errors = json?.errors;
  const list = Array.isArray(errors) ? errors : errors ? Object.values(errors).flat() : [];
  return list.some((e: unknown) =>
    typeof e === 'string' &&
    /no subscribers|invalid_player_ids|no recipients|All included players are not subscribed/i.test(e)
  );
}

/**
 * Send a push via OneSignal.
 *
 * Targeting order:
 *  1. Stored subscription IDs (device-level), if any exist.
 *  2. external_id alias — the Supabase user id linked via OneSignal.login()
 *     on the device. This works even when we have no stored player IDs.
 */
export async function sendOneSignalNotificationDetailed(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<OneSignalResult> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID') ?? Deno.env.get('ONE_SIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? Deno.env.get('ONE_SIGNAL_REST_API_KEY');

  if (!appId || !apiKey) {
    console.error('[OneSignal] credentials not configured');
    return { success: false, target: 'none', error: 'credentials_not_configured' };
  }

  const base: Record<string, unknown> = {
    app_id: appId,
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
    target_channel: 'push',
  };
  if (payload.buttons?.length) {
    base.buttons = payload.buttons;
    base.ios_category = 'REMINDER_ACTIONS';
  }
  if (payload.url) base.url = payload.url;

  const subscriptionIds = await getSubscriptionIds(supabase, payload.userId);
  console.log(
    `[OneSignal] user=${payload.userId} stored_subscription_ids=${subscriptionIds.length}`
  );

  // 1) Try device subscription IDs
  if (subscriptionIds.length > 0) {
    const { ok, status, json } = await postToOneSignal(
      { ...base, include_subscription_ids: subscriptionIds },
      apiKey
    );
    console.log('[OneSignal] subscription_ids attempt', status, JSON.stringify(json));
    if (ok && json?.id && !hasNoRecipients(json)) {
      return { success: true, target: 'subscription_ids', notificationId: json.id, raw: json };
    }
    console.warn('[OneSignal] subscription_ids targeting failed, falling back to external_id');
  }

  // 2) Fall back to the external_id alias (the app's Supabase user id)
  const { ok, status, json } = await postToOneSignal(
    { ...base, include_aliases: { external_id: [payload.userId] } },
    apiKey
  );
  console.log('[OneSignal] external_id attempt', status, JSON.stringify(json));

  if (ok && json?.id && !hasNoRecipients(json)) {
    return { success: true, target: 'external_id', notificationId: json.id, raw: json };
  }

  const errorText =
    (Array.isArray(json?.errors) ? json.errors.join(', ') : JSON.stringify(json?.errors)) ||
    `onesignal_status_${status}`;

  return { success: false, target: 'none', error: errorText, raw: json };
}

/** Backwards-compatible boolean wrapper. */
export async function sendOneSignalNotification(
  supabase: SupabaseClient,
  payload: OneSignalPayload
): Promise<boolean> {
  try {
    const result = await sendOneSignalNotificationDetailed(supabase, payload);
    if (!result.success) {
      console.error(`[OneSignal] delivery failed for ${payload.userId}: ${result.error}`);
    }
    return result.success;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[OneSignal] request timeout');
    } else {
      console.error('[OneSignal] exception:', error);
    }
    return false;
  }
}
