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
  status: number | null;
  notificationId: string | null;
  recipients: number;
  errors: unknown;
  body: unknown;
  targeted: number;
  invalidSubscriptionIds: string[];
  reason?: string;
}

/** Collect every OneSignal subscription id we have stored for a user. */
export async function collectSubscriptionIds(
  supabase: SupabaseClient,
  userId: string,
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

  const ids: string[] = [];
  if (tokenResult.data) ids.push(...tokenResult.data.map((t: { token: string }) => t.token));
  if (playerResult.data) ids.push(...playerResult.data.map((p: { player_id: string }) => p.player_id));

  // OneSignal subscription ids are UUIDs. An FCM token is NOT a subscription id.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set(ids)].filter((id) => typeof id === 'string' && UUID_RE.test(id.trim())).map((id) => id.trim());
}

/** Remove subscription ids OneSignal rejected so we stop targeting dead installs. */
export async function pruneInvalidSubscriptionIds(
  supabase: SupabaseClient,
  userId: string,
  invalidIds: string[],
): Promise<void> {
  if (invalidIds.length === 0) return;
  console.log(`[ONESIGNAL] Pruning ${invalidIds.length} stale subscription id(s) for user ${userId}`);
  await Promise.all([
    supabase.from('onesignal_player_ids').delete().eq('user_id', userId).in('player_id', invalidIds),
    supabase
      .from('notification_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'onesignal')
      .in('token', invalidIds),
  ]);
}

/**
 * Send a push via the OneSignal REST API and report exactly what happened.
 * NOTE: HTTP 200 from OneSignal does NOT mean delivery — OneSignal returns 200
 * with `recipients: 0` and an `errors` payload when every target is unsubscribed.
 */
export async function sendOneSignalNotificationDetailed(
  supabase: SupabaseClient,
  payload: OneSignalPayload,
): Promise<OneSignalSendResult> {
  const base: OneSignalSendResult = {
    success: false,
    status: null,
    notificationId: null,
    recipients: 0,
    errors: null,
    body: null,
    targeted: 0,
    invalidSubscriptionIds: [],
  };

  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

  if (!appId || !apiKey) {
    console.error('[ONESIGNAL] Error: credentials not configured (ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY)');
    return { ...base, reason: 'OneSignal credentials not configured' };
  }

  const subscriptionIds = await collectSubscriptionIds(supabase, payload.userId);
  base.targeted = subscriptionIds.length;
  console.log(`[ONESIGNAL] Recipient identifier(s) for user ${payload.userId}: ${subscriptionIds.length} subscription id(s)`);

  if (subscriptionIds.length === 0) {
    return { ...base, reason: 'No OneSignal subscription ids registered for this user' };
  }

  const body: Record<string, unknown> = {
    app_id: appId,
    // Current REST API targeting field (include_player_ids is the deprecated alias).
    include_subscription_ids: subscriptionIds,
    target_channel: 'push',
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data || {},
  };

  if (payload.buttons?.length) {
    body.buttons = payload.buttons;
    body.ios_category = 'REMINDER_ACTIONS';
  }
  if (payload.url) body.url = payload.url;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ONESIGNAL_TIMEOUT_MS);

  try {
    console.log(`[ONESIGNAL] Sending request to ${ONESIGNAL_API_URL} (app ${appId.slice(0, 8)}…)`);
    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey.trim()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const rawText = await response.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { raw: rawText };
    }

    console.log(`[ONESIGNAL] HTTP status: ${response.status}`);
    console.log(`[ONESIGNAL] Response body: ${rawText}`);

    const notificationId: string | null = parsed?.id || null;
    const recipients: number = typeof parsed?.recipients === 'number' ? parsed.recipients : 0;
    const errors = parsed?.errors ?? null;

    console.log(`[ONESIGNAL] Notification ID: ${notificationId || 'none'}`);
    console.log(`[ONESIGNAL] Recipients accepted: ${recipients}`);
    if (errors) console.log(`[ONESIGNAL] Error: ${JSON.stringify(errors)}`);

    // OneSignal surfaces dead installs as errors.invalid_player_ids / invalid_external_user_ids
    const invalid: string[] = Array.isArray(errors?.invalid_player_ids)
      ? errors.invalid_player_ids
      : Array.isArray(errors?.invalid_subscription_ids)
        ? errors.invalid_subscription_ids
        : [];

    const allUnsubscribed =
      Array.isArray(errors) && errors.some((e: unknown) => typeof e === 'string' && /not subscribed/i.test(e));

    const staleIds = invalid.length > 0 ? invalid : allUnsubscribed ? subscriptionIds : [];
    if (staleIds.length > 0) {
      await pruneInvalidSubscriptionIds(supabase, payload.userId, staleIds);
    }

    const success = response.ok && !!notificationId && recipients > 0;

    return {
      success,
      status: response.status,
      notificationId,
      recipients,
      errors,
      body: parsed,
      targeted: subscriptionIds.length,
      invalidSubscriptionIds: staleIds,
      reason: success
        ? undefined
        : allUnsubscribed
          ? 'All targeted OneSignal subscriptions are unsubscribed or stale (device likely reinstalled). Re-register this device.'
          : recipients === 0
            ? 'OneSignal accepted the request but matched 0 recipients'
            : `OneSignal request failed with status ${response.status}`,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    console.error(`[ONESIGNAL] Error: ${isTimeout ? 'request timeout' : String(error)}`);
    return { ...base, reason: isTimeout ? 'OneSignal request timeout' : String(error) };
  }
}

/** Backwards-compatible boolean wrapper used by schedulers. */
export async function sendOneSignalNotification(
  supabase: SupabaseClient,
  payload: OneSignalPayload,
): Promise<boolean> {
  const result = await sendOneSignalNotificationDetailed(supabase, payload);
  if (!result.success) console.error('[ONESIGNAL] Send failed:', result.reason);
  return result.success;
}
