import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  sendOneSignalNotificationDetailed,
  type OneSignalResult,
} from './onesignal.ts';
import type { NotificationPayload } from './types.ts';

/**
 * Unified notification sender. OneSignal is the single delivery path;
 * the Supabase user_id is used only to resolve canonical subscription IDs.
 */
export async function sendUnifiedNotificationDetailed(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<OneSignalResult> {
  try {
    console.log(`[NOTIFICATIONS] Delivering to user_id=${payload.userId}`);
    const result = await sendOneSignalNotificationDetailed(supabase, {
      userId: payload.userId,
      title: payload.title,
      message: payload.message,
      data: payload.data
        ? Object.fromEntries(
            Object.entries(payload.data).map(([k, v]) => [k, String(v)])
          )
        : undefined,
      buttons: payload.buttons,
    });

    console.log(
      `[NOTIFICATIONS] user_id=${payload.userId} reason=${result.reason} recipients=${result.recipients}${
        result.error ? ` error=${result.error}` : ''
      }`
    );

    return result;
  } catch (error) {
    console.error('[NOTIFICATIONS] Unified sender exception:', error);
    return {
      success: false,
      reason: 'exception',
      recipients: 0,
      subscriptionIds: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendUnifiedNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<boolean> {
  const result = await sendUnifiedNotificationDetailed(supabase, payload);
  return result.success;
}
