/**
 * OneSignal push notification sender.
 *
 * Direct port of supabase/functions/_shared/onesignal.ts adapted for
 * the Node.js / Firebase Admin SDK context.
 *
 * Targeting strategy (unchanged from Supabase implementation):
 *   1. Collect subscription IDs from Firestore:
 *        users/{userId}/notification_tokens  (provider == 'onesignal')
 *        users/{userId}/onesignal_player_ids
 *   2. Primary send:  include_subscription_ids
 *   3. Fallback send: include_aliases { external_id: [userId] }
 *      (set when the device calls OneSignal.login(userId))
 */

import { adminDb } from './admin';
import type { OneSignalResult, NotificationPayload } from './types';

const ONESIGNAL_API_URL = 'https://api.onesignal.com/notifications';
const ONESIGNAL_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Token collection
// ---------------------------------------------------------------------------

async function collectSubscriptionIds(userId: string): Promise<string[]> {
  const [tokensSnap, playerIdsSnap] = await Promise.all([
    adminDb
      .collection('users')
      .doc(userId)
      .collection('notification_tokens')
      .where('provider', '==', 'onesignal')
      .get(),
    adminDb
      .collection('users')
      .doc(userId)
      .collection('onesignal_player_ids')
      .get(),
  ]);

  const ids: string[] = [];
  tokensSnap.forEach((d) => {
    const token = d.data().token as string | undefined;
    if (token) ids.push(token);
  });
  playerIdsSnap.forEach((d) => {
    const pid = d.data().playerId as string | undefined;
    if (pid) ids.push(pid);
  });

  return [...new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 10))];
}

// ---------------------------------------------------------------------------
// OneSignal REST call
// ---------------------------------------------------------------------------

async function postToOneSignal(
  appId: string,
  apiKey: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; text: string; json?: Record<string, unknown> }> {
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
    let json: Record<string, unknown> | undefined;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { ok: response.ok, status: response.status, text, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Public sender
// ---------------------------------------------------------------------------

export async function sendOneSignalNotificationDetailed(
  payload: NotificationPayload
): Promise<OneSignalResult> {
  const appId =
    process.env.ONESIGNAL_APP_ID ?? process.env.ONE_SIGNAL_APP_ID;
  const apiKey =
    process.env.ONESIGNAL_REST_API_KEY ?? process.env.ONE_SIGNAL_REST_API_KEY;

  if (!appId || !apiKey) {
    console.error('[OneSignal] Credentials not configured');
    return { success: false, reason: 'no_credentials' };
  }

  const base: Record<string, unknown> = {
    headings: { en: payload.title },
    contents: { en: payload.message },
    data: payload.data ?? {},
  };
  if (payload.buttons?.length) {
    base.buttons = payload.buttons;
    base.ios_category = 'REMINDER_ACTIONS';
  }
  if (payload.url) base.url = payload.url;

  const subscriptionIds = await collectSubscriptionIds(payload.userId);

  const attempts: Record<string, unknown>[] = [];
  if (subscriptionIds.length > 0) {
    attempts.push({ ...base, include_subscription_ids: subscriptionIds });
  }
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
        console.log(`[OneSignal] Delivered to ${payload.userId}:`, res.json.id);
        return { success: true, notificationId: res.json.id as string, targets: subscriptionIds.length };
      }
      lastDetail = res.text;
      console.warn(`[OneSignal] Attempt failed (${res.status}):`, res.text);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[OneSignal] Timeout');
        lastDetail = 'timeout';
        continue;
      }
      lastDetail = String(error);
      console.error('[OneSignal] Exception:', error);
    }
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
  payload: NotificationPayload
): Promise<boolean> {
  const result = await sendOneSignalNotificationDetailed(payload);
  return result.success;
}
