import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';

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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Authentication failed:', userError);
      return createErrorResponse('Not authenticated', 401, req);
    }

    const { token: deviceToken, provider, device_info } = await req.json();

    if (!deviceToken || !provider) {
      return createErrorResponse('Missing required fields: token and provider', 400, req);
    }

    if (provider !== 'onesignal') {
      return createErrorResponse('Invalid provider. Only onesignal provider is supported now.', 400, req);
    }

    if (typeof deviceToken !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceToken)) {
      return createErrorResponse('Invalid OneSignal subscription ID', 400, req);
    }

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey) return createErrorResponse('Notification service is not configured', 500, req);
    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log(`Registering ${provider} token for user ${user.id}`);

    // Upsert the notification token
    const { error: upsertError } = await serviceClient
      .from('notification_tokens')
      .upsert({
        user_id: user.id,
        token: deviceToken,
        provider,
        device_info: device_info || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,token,provider'
      });

    if (upsertError) {
      console.error('Failed to save notification token:', upsertError);
      return createErrorResponse('Failed to save notification token', 500, req);
    }

    const { error: legacyError } = await serviceClient
      .from('onesignal_player_ids')
      .upsert({
        user_id: user.id,
        player_id: deviceToken,
        device_info: device_info || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'player_id' });

    if (legacyError) console.warn('Could not mirror legacy OneSignal registration:', legacyError);

    console.log(`Successfully registered ${provider} token for user ${user.id}`);

    return createJsonResponse({
      success: true,
      message: 'Notification token registered successfully',
      provider,
    }, 200, req);
  } catch (error) {
    console.error('Error in update-notification-token:', error);
    return createErrorResponse(error as Error, 500, req);
  }
});
