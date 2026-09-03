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
  reason?: 'no_credentials' | 'no_targets' | 'rejected' | 'error' | 'timeout';
  detail?: string;
  notificationId?: string;
  targets?: number;
}

async function collectSubscriptionIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const [tokenResult, playerResult] = await Promise.all([
    supabase
      .from('notification_tokens')
      .select('token')
      .eq('user_id', userId)
      .eq('provider', 'onesignal'),
    supabase.from('onesignal_player_ids').select('player_id').eq('user_id', userId),
  ]);

  const ids: string[] = [];
  if (tokenResult.data) ids.push(...tokenResult.data.map((t: any) => t.token));
  if (playerResult.data) ids.push(...playerResult.data.map((p: any) => p.player_id));

  return [...new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 10))];
}

async function postToOneSignal(
  appId: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; text: string; json?: any }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ONESIGNAL_TIMEOUT_MS);
  try {
    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey.trim()}`,
      },
      body: JSON.stringify({ app_id: appId, ...body }),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch { /* non-json */ }
    return { ok: response.ok, status: response.status, text, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Send a push via OneSignal. Targets the user's stored subscription ids first
 * and falls back to external-id targeting (set by OneSignal.login on the device).
 */
export async function sendOneSignalNotificationDetailed(
  supabase: SupabaseClient,
  payload: OneSignalPayload,
): Promise<OneSignalResult> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID') ?? Deno.env.get('ONE_SIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? Deno.env.get('ONE_SIGNAL_REST_API_KEY');

  if (!appId || !apiKey) {
    console.error('OneSignal credentials not configured');
    return { success: false, reason: 'no_credentials' };
  }

  const base: Record<string, unknown> = {
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
  };
  if (payload.buttons?.length) {
    base.buttons = payload.buttons;
    base.ios_category = 'REMINDER_ACTIONS';
  }
  if (payload.url) base.url = payload.url;

  const subscriptionIds = await collectSubscriptionIds(supabase, payload.userId);

  const attempts: Record<string, unknown>[] = [];
  if (subscriptionIds.length > 0) {
    attempts.push({ ...base, include_subscription_ids: subscriptionIds });
  }
  // External-id targeting always attempted as fallback (device calls OneSignal.login(userId)).
  attempts.push({
    ...base,
    include_aliases: { external_id: [payload.userId] },
    target_channel: 'push',
  });

  let lastDetail = '';
  for (const body of attempts) {
    try {
      const res = await postToOneSignal(appId, apiKey, body);
      if (res.ok && res.json?.id && res.json?.errors === undefined) {
        console.log(`OneSignal delivered to user ${payload.userId}`, res.json.id);
        return {
          success: true,
          notificationId: res.json.id,
          targets: subscriptionIds.length,
        };
      }
      lastDetail = res.text;
      console.warn(`OneSignal attempt failed (${res.status}):`, res.text);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('OneSignal timeout');
        lastDetail = 'timeout';
        continue;
      }
      lastDetail = String(error);
      console.error('OneSignal exception:', error);
    }
  }

  if (subscriptionIds.length === 0 && lastDetail.includes('include_player_ids')) {
    return { success: false, reason: 'no_targets', detail: lastDetail };
  }

  return {
    success: false,
    reason: subscriptionIds.length === 0 ? 'no_targets' : 'rejected',
    detail: lastDetail,
    targets: subscriptionIds.length,
  };
}

/** Boolean wrapper kept for existing call sites. */
export async function sendOneSignalNotification(
  supabase: SupabaseClient,
  payload: OneSignalPayload,
): Promise<boolean> {
  const result = await sendOneSignalNotificationDetailed(supabase, payload);
  return result.success;
}
