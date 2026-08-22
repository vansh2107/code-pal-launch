import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { sendOneSignalNotificationDetailed, collectSubscriptionIds } from '../_shared/onesignal.ts';
import { getFunnyNotification } from '../_shared/funnyNotifications.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    console.log('[TEST PUSH] Request received');

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse('No authorization header', 401, req);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);

    if (userError || !user) {
      console.error('[TEST PUSH] Authentication failed:', userError);
      return createErrorResponse('Not authenticated', 401, req);
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);

    const subscriptionIds = await collectSubscriptionIds(serviceSupabase, user.id);
    console.log(`[TEST PUSH] Recipient identifier: ${subscriptionIds.join(', ') || 'NONE'}`);

    if (subscriptionIds.length === 0) {
      return createJsonResponse(
        {
          success: false,
          error: 'No OneSignal subscription id registered for this account. Open the app on the device to register it.',
          targeted: 0,
        },
        422,
        req,
      );
    }

    const testNotification = getFunnyNotification('document_expiring', {
      documentName: 'Test Document',
      daysUntilExpiry: 5,
    });

    const result = await sendOneSignalNotificationDetailed(serviceSupabase, {
      userId: user.id,
      title: testNotification.title,
      message: testNotification.message + ' (Test notification 🎉)',
      data: { type: 'test', date: new Date().toISOString() },
    });

    if (!result.success) {
      // Never report 200 unless OneSignal itself accepted at least one recipient.
      return createJsonResponse(
        {
          success: false,
          error: result.reason || 'OneSignal did not accept the notification',
          onesignal_status: result.status,
          onesignal_response: result.body,
          onesignal_errors: result.errors,
          notification_id: result.notificationId,
          recipients: result.recipients,
          targeted: result.targeted,
          pruned_stale_subscription_ids: result.invalidSubscriptionIds,
        },
        502,
        req,
      );
    }

    return createJsonResponse(
      {
        success: true,
        message: `OneSignal accepted the notification for ${result.recipients} device(s)`,
        notification_id: result.notificationId,
        recipients: result.recipients,
        targeted: result.targeted,
        onesignal_status: result.status,
      },
      200,
      req,
    );
  } catch (error) {
    console.error('[TEST PUSH] Error:', error);
    return createErrorResponse(error as Error, 500, req);
  }
});
