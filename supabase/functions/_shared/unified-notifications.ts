import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendOneSignalNotificationDetailed, type OneSignalResult } from './onesignal.ts';
import type { NotificationPayload } from './types.ts';

/**
 * Unified notification sender. Always attempts delivery through OneSignal:
 * stored subscription ids first, external-id targeting as fallback.
 */
export async function sendUnifiedNotificationDetailed(
  supabase: SupabaseClient,
  payload: NotificationPayload,
): Promise<OneSignalResult> {
  try {
    const result = await sendOneSignalNotificationDetailed(supabase, {
      userId: payload.userId,
      title: payload.title,
      message: payload.message,
      data: payload.data
        ? Object.fromEntries(Object.entries(payload.data).map(([k, v]) => [k, String(v)]))
        : undefined,
      buttons: payload.buttons,
    });
    console.log(
      `Notification for user ${payload.userId}: ${result.success ? 'delivered' : `failed (${result.reason})`}`,
    );
    return result;
  } catch (error) {
    console.error('Error in unified notification sender:', error);
    return { success: false, reason: 'error', detail: String(error) };
  }
}

export async function sendUnifiedNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload,
): Promise<boolean> {
  const result = await sendUnifiedNotificationDetailed(supabase, payload);
  return result.success;
}
