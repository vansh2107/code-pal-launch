import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { sendUnifiedNotification } from '../_shared/unified-notifications.ts';
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

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);

    // ── Diagnostics: what can we actually deliver to? ───────────────────────
    const [{ data: playerRows }, { data: tokenRows }] = await Promise.all([
      serviceSupabase.from('onesignal_player_ids').select('player_id').eq('user_id', user.id),
      serviceSupabase.from('notification_tokens').select('provider').eq('user_id', user.id),
    ]);

    const diagnostics = {
      userId: user.id,
      oneSignalPlayerIds: playerRows?.length ?? 0,
      notificationTokens: tokenRows?.length ?? 0,
      providers: [...new Set((tokenRows ?? []).map((t: { provider: string }) => t.provider))],
      oneSignalConfigured: !!Deno.env.get('ONESIGNAL_APP_ID') && !!Deno.env.get('ONESIGNAL_REST_API_KEY'),
      fcmConfigured: !!Deno.env.get('FIREBASE_SERVER_KEY'),
    };
    console.log('test-push diagnostics:', JSON.stringify(diagnostics));

    if (diagnostics.oneSignalPlayerIds === 0 && diagnostics.notificationTokens === 0) {
      return createJsonResponse({
        success: false,
        error: 'This device is not registered for push yet. Open the app on your phone, allow notifications, wait ~10 seconds, then try again.',
        diagnostics,
      });
    }

    if (!diagnostics.oneSignalConfigured && !diagnostics.fcmConfigured) {
      return createJsonResponse({
        success: false,
        error: 'Push provider credentials are not configured on the server (ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY).',
        diagnostics,
      });
    }

    const testNotification = getFunnyNotification('document_expiring', {
      documentName: 'Test Document',
      daysUntilExpiry: 5,
    });

    const sent = await sendUnifiedNotification(serviceSupabase, {
      userId: user.id,
      title: testNotification.title,
      message: testNotification.message + ' (Test notification 🎉)',
      data: {
        type: 'test',
        date: new Date().toISOString(),
      },
    });

    return createJsonResponse({
      success: sent,
      message: sent
        ? 'Test push notification sent!'
        : 'Provider rejected the notification — check edge function logs.',
      diagnostics,
    });
  } catch (error) {
    console.error('Error in test-push-notification:', error);
    return createErrorResponse(error as Error);
  }
});
