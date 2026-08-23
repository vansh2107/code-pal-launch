import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendOneSignalNotificationDetailed } from './onesignal.ts';
import type { NotificationPayload } from './types.ts';

/**
 * Unified notification sender.
 *
 * Never bails out just because no subscription/player IDs are stored — the
 * OneSignal external_id alias (the Supabase user id) is used as a fallback,
 * so a device that registered with OneSignal but never wrote a row still
 * receives the push.
 */
export async function sendUnifiedNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const result = await sendOneSignalNotificationDetailed(supabase, payload);
    console.log(
      `[Unified] user=${payload.userId} success=${result.success} target=${result.target} ` +
        `notification_id=${result.notificationId ?? 'none'} error=${result.error ?? 'none'}`
    );
    return result.success;
  } catch (error) {
    console.error('[Unified] error in notification sender:', error);
    return false;
  }
}
