import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendFCMNotification } from './fcm.ts';
import { sendOneSignalNotification } from './onesignal.ts';
import type { NotificationPayload } from './types.ts';

/**
 * Unified notification sender that automatically detects and uses
 * the available notification provider (FCM or OneSignal) for a user
 */
export async function sendUnifiedNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    console.log(`Sending unified notification to user ${payload.userId}`);

    // Check which providers the user has tokens for
    const { data: tokens, error } = await supabase
      .from('notification_tokens')
      .select('provider')
      .eq('user_id', payload.userId);

    if (error) {
      console.error('Failed to fetch notification tokens:', error);
      return false;
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
      return false;
    }

    const results: boolean[] = [];

    // Send via all available providers
    if (providers.has('fcm')) {
      const fcmResult = await sendFCMNotification(supabase, payload);
      results.push(fcmResult);
      console.log(`FCM notification result: ${fcmResult}`);
    }

    if (providers.has('onesignal')) {
      const oneSignalResult = await sendOneSignalNotification(supabase, payload);
      results.push(oneSignalResult);
      console.log(`OneSignal notification result: ${oneSignalResult}`);
    }

    // Return true if at least one provider succeeded
    const success = results.some(r => r === true);
    console.log(`Unified notification ${success ? 'succeeded' : 'failed'} for user ${payload.userId}`);
    
    return success;
  } catch (error) {
    console.error('Error in unified notification sender:', error);
    return false;
  }
}
