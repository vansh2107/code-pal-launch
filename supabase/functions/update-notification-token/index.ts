import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';

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

    const body = await req.json();
    const deviceToken: string | undefined = body?.token;
    const rawProvider: string | undefined = body?.provider;
    const platform: string | undefined = body?.platform;
    const device_info: string | undefined = body?.device_info;

    if (!deviceToken || typeof deviceToken !== 'string' || !rawProvider) {
      return createErrorResponse('Missing required fields: token and provider', 400);
    }

    // Normalize provider aliases coming from different clients.
    // The DB check constraint only allows 'fcm' | 'onesignal'.
    const aliasMap: Record<string, 'fcm' | 'onesignal'> = {
      onesignal: 'onesignal',
      'onesignal-capacitor': 'onesignal',
      'onesignal-cordova': 'onesignal',
      despia: 'onesignal',
      fcm: 'fcm',
      gcm: 'fcm',
      firebase: 'fcm',
      // Capacitor's PushNotifications plugin yields a native FCM/APNs token
      capacitor: 'fcm',
      apns: 'fcm',
    };

    const provider = aliasMap[String(rawProvider).toLowerCase()];
    if (!provider) {
      return createErrorResponse(
        `Invalid provider "${rawProvider}". Supported: onesignal, fcm (aliases: capacitor, gcm, apns, despia)`,
        400
      );
    }

    // Shape validation: OneSignal subscription IDs are UUIDs; FCM tokens are long opaque strings.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (provider === 'onesignal' && !uuidRe.test(deviceToken)) {
      return createErrorResponse('Malformed OneSignal subscription ID (expected UUID)', 400);
    }
    if (provider === 'fcm' && (deviceToken.length < 20 || uuidRe.test(deviceToken))) {
      return createErrorResponse('Malformed FCM/APNs device token', 400);
    }

    const deviceInfo = [device_info, platform ? `platform=${platform}` : null]
      .filter(Boolean)
      .join(' | ') || null;

    console.log(
      `[NOTIFICATIONS] Registering provider=${provider} (raw=${rawProvider}) platform=${platform ?? 'unknown'} for user ${user.id}`
    );

    // Upsert the notification token (unique on user_id,token,provider → no duplicates)
    const { error: upsertError } = await supabase
      .from('notification_tokens')
      .upsert({
        user_id: user.id,
        token: deviceToken,
        provider,
        device_info: deviceInfo,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,token,provider'
      });

    if (upsertError) {
      console.error('Failed to save notification token:', upsertError);
      return createErrorResponse('Failed to save notification token', 500);
    }

    console.log(`Successfully registered ${provider} token for user ${user.id}`);

    return createJsonResponse({
      success: true,
      message: 'Notification token registered successfully',
      provider,
    });
  } catch (error) {
    console.error('Error in update-notification-token:', error);
    return createErrorResponse(error as Error);
  }
});
