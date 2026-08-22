import { createSupabaseClient } from '../_shared/database.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { sanitizeInput } from '../_shared/notifications.ts';
import { sendOneSignalNotificationDetailed } from '../_shared/onesignal.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { NotificationPayload } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    const { userId, title, message, data, buttons, url }: NotificationPayload = await req.json();
    
    if (!userId || !title || !message) {
      return createErrorResponse('Missing required fields: userId, title, message', 400);
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
        return createErrorResponse('Unauthorized', 401);
      }
      const token = authHeader.replace('Bearer ', '');
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );
      const { data: userData, error: userErr } = await authClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return createErrorResponse('Unauthorized', 401);
      }
      if (userData.user.id !== userId) {
        console.error(
          `Forbidden: caller ${userData.user.id} tried to push to ${userId}`
        );
        return createErrorResponse('Forbidden: cannot send notifications to another user', 403);
      }
    }

    const sanitizedTitle = sanitizeInput(title);
    const sanitizedMessage = sanitizeInput(message);

    const supabase = createSupabaseClient();

    const result = await sendOneSignalNotificationDetailed(supabase, {
      userId,
      title: sanitizedTitle,
      message: sanitizedMessage,
      data,
      buttons,
      url,
    });

    if (!result.success) {
      const status = result.reason === 'no_subscriptions' ? 422 : 502;
      return createJsonResponse(
        {
          success: false,
          error: result.detail ?? 'Failed to send notification',
          reason: result.reason,
          onesignal: {
            status: result.status,
            body: result.body,
            invalidIds: result.invalidIds,
            targeted: result.targeted,
          },
        },
        status
      );
    }

    return createJsonResponse({
      success: true,
      message: `Sent to ${result.recipients} device(s)`,
      notificationId: result.notificationId,
      recipients: result.recipients,
      details: result.body,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('OneSignal request timeout');
      return createErrorResponse('OneSignal request timeout', 504);
    }
    console.error('Error in send-onesignal-notification:', error);
    return createErrorResponse(error as Error);
  }
});
