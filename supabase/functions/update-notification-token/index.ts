import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map client-side provider aliases onto the values allowed by the DB constraint.
const PROVIDER_ALIASES: Record<string, 'fcm' | 'onesignal'> = {
  fcm: 'fcm',
  gcm: 'fcm',
  firebase: 'fcm',
  apns: 'fcm',
  capacitor: 'fcm',
  onesignal: 'onesignal',
  despia: 'onesignal',
};

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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);

    if (userError || !user) {
      console.error('Authentication failed:', userError);
      return createErrorResponse('Not authenticated', 401);
    }

    const body = await req.json().catch(() => null);
    const deviceToken: unknown = body?.token;
    const rawProvider: unknown = body?.provider;
    const deviceInfo: unknown = body?.device_info;
    const platform: unknown = body?.platform;

    if (typeof deviceToken !== 'string' || !deviceToken.trim() || typeof rawProvider !== 'string') {
      return createErrorResponse('Missing required fields: token and provider', 400);
    }

    const normalizedProvider = PROVIDER_ALIASES[rawProvider.toLowerCase()];
    if (!normalizedProvider) {
      return createErrorResponse(
        `Unsupported provider "${rawProvider}". Allowed: ${Object.keys(PROVIDER_ALIASES).join(', ')}`,
        400,
      );
    }

    const cleanToken = deviceToken.trim();

    // Shape validation: OneSignal subscription IDs are UUIDs, FCM/APNS tokens are long opaque strings.
    if (normalizedProvider === 'onesignal' && !UUID_RE.test(cleanToken)) {
      return createErrorResponse('Invalid OneSignal subscription id (expected a UUID)', 400);
    }
    if (normalizedProvider === 'fcm' && (UUID_RE.test(cleanToken) || cleanToken.length < 32)) {
      return createErrorResponse('Invalid FCM/APNS device token', 400);
    }

    const deviceInfoValue = [
      typeof deviceInfo === 'string' ? deviceInfo : null,
      typeof platform === 'string' ? `platform=${platform}` : null,
      `alias=${rawProvider.toLowerCase()}`,
    ].filter(Boolean).join(' | ');

    console.log(`Registering ${normalizedProvider} token (alias ${rawProvider}) for user ${user.id}`);

    // Write with the service-role client so RLS can never silently drop a valid row.
    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { error: upsertError } = await serviceClient
      .from('notification_tokens')
      .upsert({
        user_id: user.id,
        token: cleanToken,
        provider: normalizedProvider,
        device_info: deviceInfoValue || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,token,provider',
      });

    if (upsertError) {
      console.error('Failed to save notification token:', upsertError);
      return createErrorResponse(`Failed to save notification token: ${upsertError.message}`, 500);
    }

    // Keep the legacy OneSignal table in sync for the older senders.
    if (normalizedProvider === 'onesignal') {
      const { error: playerError } = await serviceClient
        .from('onesignal_player_ids')
        .upsert({
          user_id: user.id,
          player_id: cleanToken,
          device_info: deviceInfoValue || null,
        }, { onConflict: 'player_id' });
      if (playerError) {
        console.error('Failed to mirror OneSignal player id:', playerError);
      }
    }

    return createJsonResponse({
      success: true,
      message: 'Notification token registered successfully',
      provider: normalizedProvider,
    });
  } catch (error) {
    console.error('Error in update-notification-token:', error);
    return createErrorResponse(error as Error);
  }
});
