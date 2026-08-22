import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendFCMNotification } from './fcm.ts';
import { sendOneSignalNotificationDetailed, type OneSignalResult } from './onesignal.ts';
import type { NotificationPayload } from './types.ts';

/**
 * Unified notification sender that automatically detects and uses
 * the available notification provider (FCM or OneSignal) for a user
 */
export interface UnifiedResult {
  success: boolean;
  reason?: string;
  detail?: string;
  onesignal?: OneSignalResult;
  fcm?: boolean;
}

export async function sendUnifiedNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<boolean> {
  const result = await sendUnifiedNotificationDetailed(supabase, payload);
  return result.success;
}

export async function sendUnifiedNotificationDetailed(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<UnifiedResult> {
  try {
    console.log(`Sending unified notification to user ${payload.userId}`);

    // Check which providers the user has tokens for
    const { data: tokens, error } = await supabase
      .from('notification_tokens')
      .select('provider')
      .eq('user_id', payload.userId);

    if (error) {
      console.error('Failed to fetch notification tokens:', error);
      return { success: false, reason: 'db_error', detail: error.message };
    }

    const providers = new Set(tokens?.map(t => t.provider) || []);
    
    // Also check onesignal_player_ids table for backward compatibility
    const { data: playerIds } = await supabase
      .from('onesignal_player_ids')
      .select('player_id')
      .eq('user_id', payload.userId)
      .limit(1);

    if (playerIds && playerIds.length > 0) {
      providers.add('onesignal');
    }

    if (providers.size === 0) {
      console.log(`No notification providers found for user ${payload.userId}`);
      return {
        success: false,
        reason: 'no_subscriptions',
        detail: 'No push subscription registered for this user',
      };
    }

    let fcm: boolean | undefined;
    let onesignal: OneSignalResult | undefined;

    if (providers.has('fcm')) {
      fcm = await sendFCMNotification(supabase, payload);
      console.log(`FCM notification result: ${fcm}`);
    }

    if (providers.has('onesignal')) {
      onesignal = await sendOneSignalNotificationDetailed(supabase, payload);
      console.log(`OneSignal notification result: ${onesignal.success}`);
    }

    const success = fcm === true || onesignal?.success === true;
    console.log(`Unified notification ${success ? 'succeeded' : 'failed'} for user ${payload.userId}`);

    return {
      success,
      reason: success ? undefined : onesignal?.reason ?? 'send_failed',
      detail: success ? undefined : onesignal?.detail ?? 'Push provider did not accept the notification',
      onesignal,
      fcm,
    };
  } catch (error) {
    console.error('Error in unified notification sender:', error);
    return { success: false, reason: 'exception', detail: (error as Error).message };
  }
}
