import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OneSignalNotificationRequest {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, title, message, data }: OneSignalNotificationRequest = await req.json();
    console.log('Sending OneSignal notification to user:', userId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's OneSignal player IDs
    const { data: playerIds, error: playerIdsError } = await supabase
      .from('onesignal_player_ids')
      .select('player_id')
      .eq('user_id', userId);

    if (playerIdsError) {
      console.error('Error fetching OneSignal player IDs:', playerIdsError);
      throw playerIdsError;
    }

    if (!playerIds || playerIds.length === 0) {
      console.log('No OneSignal player IDs found for user:', userId);
      return new Response(
        JSON.stringify({ success: false, message: 'No OneSignal player IDs registered' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const oneSignalAppId = Deno.env.get('ONESIGNAL_APP_ID');
    const oneSignalRestApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');

    console.log('OneSignal App ID:', oneSignalAppId?.substring(0, 10) + '...');
    console.log('OneSignal API Key exists:', !!oneSignalRestApiKey);
    console.log('OneSignal API Key length:', oneSignalRestApiKey?.length);

    if (!oneSignalAppId || !oneSignalRestApiKey) {
      throw new Error('OneSignal credentials not configured');
    }

    // Send notification to all player IDs
    const oneSignalPayload = {
      app_id: oneSignalAppId,
      include_player_ids: playerIds.map(p => p.player_id),
      headings: { en: title },
      contents: { en: message },
      data: data || {},
    };

    console.log('Sending OneSignal request for', playerIds.length, 'player IDs');

    // OneSignal REST API uses "Key" prefix (not "Basic")
    const oneSignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${oneSignalRestApiKey.trim()}`,
      },
      body: JSON.stringify(oneSignalPayload),
    });

    const oneSignalResult = await oneSignalResponse.json();
    console.log('OneSignal response:', oneSignalResult);

    if (!oneSignalResponse.ok) {
      console.error('OneSignal error:', oneSignalResult);
      throw new Error(oneSignalResult.errors?.join(', ') || 'Failed to send OneSignal notification');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sent to ${oneSignalResult.recipients || playerIds.length} devices`,
        details: oneSignalResult
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error('Error in send-onesignal-notification function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);
