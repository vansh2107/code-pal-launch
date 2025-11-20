import { createSupabaseClient } from '../_shared/database.ts';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { getOneSignalPlayerIds, sanitizeInput } from '../_shared/notifications.ts';
import type { NotificationPayload } from '../_shared/types.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    const { userId, title, message, data }: NotificationPayload = await req.json();
    
    if (!userId || !title || !message) {
      return createErrorResponse('Missing required fields: userId, title, message', 400);
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

    const payload = {
      app_id: oneSignalAppId,
      include_player_ids: playerIds,
      headings: { en: sanitizedTitle },
      contents: { en: sanitizedMessage },
      data: data || {},
    };

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
