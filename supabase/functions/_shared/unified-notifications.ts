import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendFCMNotification } from './fcm.ts';
import { sendOneSignalNotificationDetailed, type OneSignalSendResult } from './onesignal.ts';
import type { NotificationPayload } from './types.ts';

export interface ProviderSendResult {
  success: boolean;
  recipients?: number;
  error?: string;
}

export interface UnifiedNotificationResult {
  success: boolean;
  /** Total devices that received the notification across providers */
  recipients: number;
  /** Per-provider outcomes for diagnostics */
  providers: {
    fcm?: ProviderSendResult;
    onesignal?: OneSignalSendResult;
  };
  /** Human-readable failure reason when nothing was delivered */
  error?: string;
}

/**
 * Detailed unified sender: attempts every provider the user has registered
 * and reports per-provider results, recipient counts, and propagated errors.
 */
export async function sendUnifiedNotificationDetailed(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<UnifiedNotificationResult> {
  const providers: UnifiedNotificationResult['providers'] = {};

  try {
    console.log(`Sending unified notification to user ${payload.userId}`);

    // Check which providers the user has tokens for
    const { data: tokens, error } = await supabase
      .from('notification_tokens')
      .select('provider')
      .eq('user_id', payload.userId);

    if (error) {
      console.error('Failed to fetch notification tokens:', error);
      return {
        success: false,
        recipients: 0,
        providers,
        error: `Failed to fetch notification tokens: ${error.message}`,
      };
    }

    const providerSet = new Set(tokens?.map(t => t.provider) || []);

    // Also check onesignal_player_ids table for backward compatibility
    const { data: playerIds } = await supabase
      .from('onesignal_player_ids')
      .select('player_id')
      .eq('user_id', payload.userId)
      .limit(1);

    if (playerIds && playerIds.length > 0) {
      providerSet.add('onesignal');
    }

    if (providerSet.size === 0) {
      console.log(`No notification providers found for user ${payload.userId}`);
      return {
        success: false,
        recipients: 0,
        providers,
        error: 'No notification providers registered for user',
      };
    }

    let recipients = 0;

    // Send via all available providers
    if (providerSet.has('fcm')) {
      const fcmResult = await sendFCMNotification(supabase, payload);
      providers.fcm = {
        success: fcmResult,
        error: fcmResult ? undefined : 'FCM send failed (check FIREBASE_SERVER_KEY and token validity)',
      };
      console.log(`FCM notification result: ${fcmResult}`);
    }

    if (providerSet.has('onesignal')) {
      const oneSignalResult = await sendOneSignalNotificationDetailed(supabase, payload);
      providers.onesignal = oneSignalResult;
      if (oneSignalResult.success) {
        recipients += oneSignalResult.recipients;
      }
      console.log(`OneSignal notification result: ${oneSignalResult.success} (${oneSignalResult.recipients} recipients)`);
    }

    const outcomes = Object.values(providers);
    const success = outcomes.some(r => r.success);
    const errors = outcomes.map(r => r.error).filter(Boolean) as string[];

    console.log(`Unified notification ${success ? 'succeeded' : 'failed'} for user ${payload.userId}`);

    return {
      success,
      recipients,
      providers,
      error: success ? undefined : (errors.join(' | ') || 'All notification providers failed'),
    };
  } catch (error) {
    console.error('Error in unified notification sender:', error);
    return {
      success: false,
      recipients: 0,
      providers,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Unified notification sender that automatically detects and uses
 * the available notification provider (FCM or OneSignal) for a user.
 * Boolean wrapper kept for existing callers.
 */
export async function sendUnifiedNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<boolean> {
  const result = await sendUnifiedNotificationDetailed(supabase, payload);
  return result.success;
}
