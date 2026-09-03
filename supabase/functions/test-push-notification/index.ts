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

    console.log('Sending test OneSignal notification for user:', user.id);

    const testNotification = getFunnyNotification('document_expiring', {
      documentName: 'Test Document',
      daysUntilExpiry: 5,
    });

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);

    const result = await sendUnifiedNotificationDetailed(serviceSupabase, {
      userId: user.id,
      title: testNotification.title,
      message: testNotification.message + ' (Test notification sent via FCM/OneSignal! 🎉)',
      data: {
        type: 'test',
        date: new Date().toISOString(),
      }
    });

    if (!result.success) {
      return createJsonResponse({
        success: true,
        delivered: false,
        reason: result.reason,
        recipients: result.recipients,
        subscription_ids_found: result.subscriptionIds.length,
        error: result.error,
        message:
          result.reason === 'no_registered_device'
            ? 'No push-enabled device is registered for this account.'
            : result.error || 'Push delivery failed.',
      }, 200, req);
    }

    return createJsonResponse({
      success: true,
      delivered: true,
      reason: result.reason,
      recipients: result.recipients,
      subscription_ids_found: result.subscriptionIds.length,
      notification_id: result.notificationId,
      message: `Test push notification sent to ${result.recipients} device(s)!`,
    }, 200, req);

  } catch (error) {
    console.error('Error in test-push-notification:', error);
    return createErrorResponse(error as Error, 500, req);
  }
});
