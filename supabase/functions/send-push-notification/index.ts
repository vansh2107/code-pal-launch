import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushNotificationRequest {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, title, body, data }: PushNotificationRequest = await req.json();
    console.log('Sending push notification to user:', userId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's FCM tokens
    const { data: tokens, error: tokensError } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', userId);

    if (tokensError) {
      console.error('Error fetching FCM tokens:', tokensError);
      throw tokensError;
    }

    if (!tokens || tokens.length === 0) {
      console.log('No FCM tokens found for user:', userId);
      return new Response(
        JSON.stringify({ success: false, message: 'No FCM tokens registered' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY');
    if (!firebaseServerKey) {
      throw new Error('Firebase server key not configured');
    }

    // Send notification to each token
    const results = await Promise.allSettled(
      tokens.map(async ({ token }) => {
        const fcmPayload = {
          to: token,
          notification: {
            title: title,
            body: body,
            sound: 'default',
            priority: 'high',
          },
          data: data || {},
        };

        console.log('Sending FCM request to token:', token.substring(0, 20) + '...');

        const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${firebaseServerKey}`,
          },
          body: JSON.stringify(fcmPayload),
        });

        const fcmResult = await fcmResponse.json();
        console.log('FCM response:', fcmResult);

        // If token is invalid, remove it from database
        if (fcmResult.results?.[0]?.error === 'InvalidRegistration' || 
            fcmResult.results?.[0]?.error === 'NotRegistered') {
          console.log('Removing invalid token:', token.substring(0, 20) + '...');
          await supabase
            .from('fcm_tokens')
            .delete()
            .eq('token', token);
        }

        return fcmResult;
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`Push notifications sent: ${successCount}/${tokens.length} successful`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sent to ${successCount}/${tokens.length} devices`,
        results 
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error('Error in send-push-notification function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);
