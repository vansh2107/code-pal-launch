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

    // Authorization: server-to-server via CRON_SECRET, or a user pushing to themselves.
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
        console.error(`Forbidden: caller ${userData.user.id} tried to push to ${userId}`);
        return createErrorResponse('Forbidden: cannot send notifications to another user', 403, req);
      }
    }

    const supabase = createSupabaseClient();

    const result = await sendOneSignalNotificationDetailed(supabase, {
      userId,
      title: sanitizeInput(title),
      message: sanitizeInput(message),
      data: data || {},
      buttons,
      url,
    });

    if (!result.success) {
      return createJsonResponse(
        {
          success: false,
          error: result.reason || 'OneSignal did not accept the notification',
          onesignal_status: result.status,
          onesignal_response: result.body,
          onesignal_errors: result.errors,
          recipients: result.recipients,
          targeted: result.targeted,
          pruned_stale_subscription_ids: result.invalidSubscriptionIds,
        },
        result.targeted === 0 ? 422 : 502,
        req,
      );
    }

    return createJsonResponse(
      {
        success: true,
        message: `Sent to ${result.recipients} device(s)`,
        notification_id: result.notificationId,
        recipients: result.recipients,
        targeted: result.targeted,
      },
      200,
      req,
    );
  } catch (error) {
    console.error('Error in send-onesignal-notification:', error);
    return createErrorResponse(error as Error, 500, req);
  }
});
