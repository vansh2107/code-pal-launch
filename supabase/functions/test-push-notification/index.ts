import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { sendUnifiedNotificationDetailed } from '../_shared/unified-notifications.ts';
import { getFunnyNotification } from '../_shared/funnyNotifications.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse('No authorization header', 401, req);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Authentication failed:', userError);
      return createErrorResponse('Not authenticated', 401, req);
    }

    console.log('[TestPush] Authenticated user_id:', user.id);

    const testNotification = getFunnyNotification('document_expiring', {
      documentName: 'Test Document',
      daysUntilExpiry: 5,
    });

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);

    const result = await sendUnifiedNotificationDetailed(serviceSupabase, {
      userId: user.id,
      title: testNotification.title,
      message: testNotification.message + ' (Test notification sent via OneSignal! 🎉)',
      data: {
        type: 'test',
        date: new Date().toISOString(),
      }
    });

    console.log(`[TestPush] user=${user.id} player_ids=${result.playerIds.length} recipients=${result.recipients} success=${result.success} error=${result.error ?? 'none'}`);

    if (!result.success) {
      // Not an auth/server error: usually means this user has no registered
      // push device, or OneSignal rejected/ignored the subscription IDs.
      return createJsonResponse({
        success: true,
        delivered: false,
        reason: result.error ?? 'no_registered_device',
        player_ids_found: result.playerIds.length,
        subscription_ids: result.playerIds,
        recipients: result.recipients,
        message: result.error === 'no_registered_device'
          ? 'No push-enabled device is registered for this account. Register a device from the mobile app first.'
          : `OneSignal delivery failed: ${result.error}`,
      }, 200, req);
    }

    return createJsonResponse({
      success: true,
      delivered: result.recipients > 0,
      reason: result.recipients > 0 ? undefined : result.error,
      player_ids_found: result.playerIds.length,
      subscription_ids: result.playerIds,
      recipients: result.recipients,
      notification_id: result.notificationId,
      message: result.recipients > 0
        ? `Test push notification sent to ${result.recipients} device(s)!`
        : 'OneSignal accepted the notification but reported 0 subscribed recipients.',
    }, 200, req);

  } catch (error) {
    console.error('Error in test-push-notification:', error);
    return createErrorResponse(error as Error, 500, req);
  }
});
