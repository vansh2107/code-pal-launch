import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendOneSignalNotificationDetailed } from './onesignal.ts';
import type { NotificationPayload } from './types.ts';

export interface UnifiedNotificationResult {
  success: boolean;
  userId: string;
  provider: 'onesignal' | 'none';
  playerIds: string[];
  recipients: number;
  error?: string;
}

/**
 * Unified notification sender.
 *
 * Delivery channel is OneSignal. The Supabase user_id is used ONLY to look
 * up subscription IDs in public.onesignal_player_ids — it is never sent to
 * OneSignal itself. The lookup happens inside sendOneSignalNotificationDetailed.
 */
export async function sendUnifiedNotificationDetailed(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<UnifiedNotificationResult> {
  console.log(`[Unified] Notification request for authenticated user_id: ${payload.userId}`);

  const result = await sendOneSignalNotificationDetailed(supabase, payload);

  const unified: UnifiedNotificationResult = {
    success: result.success,
    userId: payload.userId,
    provider: result.playerIds.length > 0 ? 'onesignal' : 'none',
    playerIds: result.playerIds,
    recipients: result.recipients,
    ...(result.error ? { error: result.error } : {}),
  };

  if (result.playerIds.length === 0) {
    console.warn(`[Unified] No OneSignal subscription IDs found for user ${payload.userId}`);
  }
  console.log(`[Unified] Result for user ${payload.userId}: success=${unified.success} provider=${unified.provider} recipients=${unified.recipients}`);

  return unified;
}

/**
 * Boolean wrapper kept for existing callers (reminder schedulers, etc.).
 */
export async function sendUnifiedNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const result = await sendUnifiedNotificationDetailed(supabase, payload);
    return result.success;
  } catch (error) {
    console.error('[Unified] Error in unified notification sender:', error);
    return false;
  }
}
