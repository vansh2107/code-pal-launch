import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract token and validate user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Authentication failed:', userError);
      throw new Error('Not authenticated');
    }

    console.log('Sending test OneSignal notification for user:', user.id);

    // Call the send-onesignal-notification function
    const { data, error } = await supabase.functions.invoke('send-onesignal-notification', {
      body: {
        userId: user.id,
        title: '📅 Test: Document Reminder',
        message: 'Your document reminder for November 4, 2025 is working! OneSignal push notifications are now enabled.',
        data: {
          type: 'test',
          date: '2025-11-04'
        }
      }
    });

    if (error) {
      console.error('Error sending test notification:', error);
      throw error;
    }

    console.log('Test notification result:', data);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Test push notification sent!',
        details: data
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error('Error in test-push-notification function:', error);
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
