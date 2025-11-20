import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { sendPushNotification } from '../_shared/notifications.ts';
import { getFunnyNotification } from '../_shared/funnyNotifications.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse('No authorization header', 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Authentication failed:', userError);
      return createErrorResponse('Not authenticated', 401);
    }

    console.log('Sending test OneSignal notification for user:', user.id);

    const testNotification = getFunnyNotification('document_expiring', {
      documentName: 'Test Document',
      daysUntilExpiry: 5,
    });

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);

    // Send the test notification using the new unified system
    const { sendPushNotificationToUser } = await import('../_shared/pushNotifications.ts');
    
    const result = await sendPushNotificationToUser(serviceSupabase, {
      userId: user.id,
      title: testNotification.title,
      message: testNotification.message + ' (This is a test notification - push notifications are working! 🎉)',
      data: {
        type: 'test',
        date: new Date().toISOString(),
      }
    });

    if (!result.success) {
      return createErrorResponse('Failed to send test notification', 500);
    }

    return createJsonResponse({ 
      success: true, 
      message: `Test push notification sent via ${result.sentVia.join(' and ')}!`,
      providers: result.sentVia,
    });
  } catch (error) {
    console.error('Error in test-push-notification:', error);
    return createErrorResponse(error as Error);
  }
});
