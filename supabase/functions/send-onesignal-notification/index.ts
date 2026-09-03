import { createSupabaseClient } from '../_shared/database.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { sanitizeInput } from '../_shared/notifications.ts';
import { sendOneSignalNotificationDetailed } from '../_shared/onesignal.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { NotificationPayload } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const { userId, title, message, data, buttons, url }: NotificationPayload = await req.json();
    
    if (!userId || !title || !message) {
      return createErrorResponse('Missing required fields: userId, title, message', 400, req);
    }

    // Authorization: allow either
    //  (a) server-to-server invocation with the CRON_SECRET header, or
    //  (b) an authenticated user sending a notification to *themselves only*.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedCronSecret = req.headers.get('x-cron-secret');
    const isServerCall = !!cronSecret && providedCronSecret === cronSecret;

    if (!isServerCall) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return createErrorResponse('Unauthorized', 401, req);
      }
      const token = authHeader.replace('Bearer ', '');
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );
      const { data: userData, error: userErr } = await authClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return createErrorResponse('Unauthorized', 401, req);
      }
      if (userData.user.id !== userId) {
        console.error(
          `Forbidden: caller ${userData.user.id} tried to push to ${userId}`
        );
        return createErrorResponse('Forbidden: cannot send notifications to another user', 403, req);
      }
    }

    const sanitizedTitle = sanitizeInput(title);
    const sanitizedMessage = sanitizeInput(message);

    const supabase = createSupabaseClient();

    const result = await sendOneSignalNotificationDetailed(supabase, {
      userId,
      title: sanitizedTitle,
      message: sanitizedMessage,
      data: data
        ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
        : undefined,
      buttons,
      url,
    });

    return createJsonResponse({
      success: result.success,
      reason: result.reason,
      recipients: result.recipients,
      subscription_ids_found: result.subscriptionIds.length,
      notification_id: result.notificationId,
      error: result.error,
      message: result.success
        ? `Sent to ${result.recipients} device(s)`
        : result.error || 'Notification not delivered',
    }, 200, req);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('OneSignal request timeout');
      return createErrorResponse('OneSignal request timeout', 504, req);
    }
    console.error('Error in send-onesignal-notification:', error);
    return createErrorResponse(error as Error, 500, req);
  }
});
