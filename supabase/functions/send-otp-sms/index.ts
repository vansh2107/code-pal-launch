import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendOTPRequest {
  phone_number: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number }: SendOTPRequest = await req.json();
    console.log("Sending OTP via MSGRush to:", phone_number);

    const normalizedPhone = phone_number.replace(/[\s\-()]/g, "");
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: dbError } = await supabase
      .from("otp_codes")
      .insert({
        phone_number: normalizedPhone,
        otp_code: otp,
        expires_at: expiresAt.toISOString(),
        is_verified: false,
      });

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error("Failed to store OTP");
    }

    const msgrushApiKey = Deno.env.get("MSGRUSH_API_KEY");
    const msgrushSenderId = Deno.env.get("MSGRUSH_SENDER_ID");
    
    if (!msgrushApiKey || !msgrushSenderId) {
      console.error("MSGRush credentials not configured");
      throw new Error("SMS service not configured");
    }

    // MSGRush SMS API endpoint
    const msgrushUrl = "https://msgrush-backend-258291301565.us-central1.run.app/api/sms-api/send";
    
    // Prepare request body
    const requestBody = {
      sender_id: msgrushSenderId,
      recipients: [normalizedPhone],
      message: `Your OTP for Softly Reminder is: ${otp}. Valid for 10 minutes.`
    };

    const smsResponse = await fetch(msgrushUrl, {
      method: "POST",
      headers: {
        "X-API-Key": msgrushApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await smsResponse.json();
    console.log("MSGRush response:", responseData);

    if (!smsResponse.ok) {
      console.error("MSGRush error:", responseData);
      throw new Error("Failed to send SMS");
    }

    console.log("OTP sent successfully via MSGRush");

    return new Response(
      JSON.stringify({ success: true, message: "OTP sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-otp-sms:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
