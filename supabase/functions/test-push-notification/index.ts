import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { sendOneSignalNotificationDetailed } from '../_shared/onesignal.ts';
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

    const result = await sendOneSignalNotificationDetailed(serviceSupabase, {
      userId: user.id,
      title: testNotification.title,
      message: testNotification.message + ' (Test notification 🎉)',
      data: {
        type: 'test',
        date: new Date().toISOString(),
      },
    });

    console.log(
      `[TestPush] user=${user.id} success=${result.success} target=${result.target} error=${result.error ?? 'none'}`
    );

    if (!result.success) {
      return createJsonResponse({
        success: false,
        delivered: false,
        reason: result.error || 'onesignal_delivery_failed',
        message: `OneSignal did not accept the notification: ${result.error ?? 'unknown error'}`,
        details: result.raw,
      }, 502, req);
    }

    return createJsonResponse({
      success: true,
      delivered: true,
      target: result.target,
      notificationId: result.notificationId,
      message: 'Test push notification sent!',
    }, 200, req);

  } catch (error) {
    console.error('Error in test-push-notification:', error);
    return createErrorResponse(error as Error, 500, req);
  }
});
