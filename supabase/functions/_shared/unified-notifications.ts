import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendOneSignalNotification } from './onesignal.ts';
import type { NotificationPayload } from './types.ts';

/**
 * Unified notification sender that automatically detects and uses
 * OneSignal for a user.
 */
export async function sendUnifiedNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    console.log(`Sending unified notification to user ${payload.userId}`);

    // Check notification_tokens where provider is onesignal
    const { data: tokens, error } = await supabase
      .from('notification_tokens')
      .select('provider')
      .eq('user_id', payload.userId)
      .eq('provider', 'onesignal');

    if (error) {
      console.error('Failed to fetch notification tokens:', error);
      return false;
    }

    const hasOneSignalToken = tokens && tokens.length > 0;
    
    // Also check onesignal_player_ids table for backward compatibility
    const { data: playerIds } = await supabase
      .from('onesignal_player_ids')
      .select('player_id')
      .eq('user_id', payload.userId)
      .limit(1);

    const hasPlayerId = playerIds && playerIds.length > 0;

    if (!hasOneSignalToken && !hasPlayerId) {
      console.log(`No OneSignal notification channels found for user ${payload.userId}`);
      return false;
    }

    const success = await sendOneSignalNotification(supabase, payload);
    console.log(`OneSignal notification result: ${success}`);
    console.log(`Unified notification ${success ? 'succeeded' : 'failed'} for user ${payload.userId}`);
    
    return success;
  } catch (error) {
    console.error('Error in unified notification sender:', error);
    return false;
  }
}
