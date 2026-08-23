import { createSupabaseClient } from '../_shared/database.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { getOneSignalPlayerIds, sanitizeInput } from '../_shared/notifications.ts';
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
    const playerIds = await getOneSignalPlayerIds(supabase, userId);

    if (playerIds.length === 0) {
      return createJsonResponse({ 
        success: false, 
        message: 'No OneSignal player IDs registered for user' 
      });
    }

    const oneSignalAppId = Deno.env.get('ONESIGNAL_APP_ID');
    const oneSignalRestApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!oneSignalAppId || !oneSignalRestApiKey) {
      throw new Error('OneSignal credentials not configured');
    }

    const payload: Record<string, unknown> = {
      app_id: oneSignalAppId,
      include_player_ids: playerIds,
      headings: { en: sanitizedTitle },
      contents: { en: sanitizedMessage },
      data: data || {},
    };

    if (buttons && buttons.length > 0) {
      payload.buttons = buttons;
      payload.ios_category = 'REMINDER_ACTIONS';
    }
    if (url) payload.url = url;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${oneSignalRestApiKey.trim()}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json();

    if (!response.ok) {
      console.error('OneSignal error:', result);
      throw new Error(result.errors?.join(', ') || 'Failed to send notification');
    }

    return createJsonResponse({ 
      success: true, 
      message: `Sent to ${result.recipients || playerIds.length} devices`,
      details: result
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
