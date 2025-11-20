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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for rate limiting - max 3 OTPs per phone per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const { data: recentOTPs, error: checkError } = await supabase
      .from("otp_codes")
      .select("created_at, last_otp_sent_at")
      .eq("phone_number", normalizedPhone)
      .gte("created_at", oneHourAgo.toISOString())
      .order("created_at", { ascending: false });

    if (checkError) {
      console.error("Error checking rate limit:", checkError);
    }

    // Count OTPs sent in the last hour
    if (recentOTPs && recentOTPs.length >= 3) {
      console.log("Rate limit exceeded for phone:", normalizedPhone);
      return new Response(
        JSON.stringify({ error: "Too many OTP requests. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Implement exponential backoff
    if (recentOTPs && recentOTPs.length > 0) {
      const lastSent = new Date(recentOTPs[0].last_otp_sent_at || recentOTPs[0].created_at);
      const timeSinceLastOTP = Date.now() - lastSent.getTime();
      
      let requiredWaitTime = 0;
      if (recentOTPs.length === 1) {
        requiredWaitTime = 60 * 1000; // 1 minute for second OTP
      } else if (recentOTPs.length === 2) {
        requiredWaitTime = 5 * 60 * 1000; // 5 minutes for third OTP
      }

      if (timeSinceLastOTP < requiredWaitTime) {
        const waitSeconds = Math.ceil((requiredWaitTime - timeSinceLastOTP) / 1000);
        console.log(`Exponential backoff: wait ${waitSeconds}s for phone:`, normalizedPhone);
        return new Response(
          JSON.stringify({ 
            error: `Please wait ${waitSeconds} seconds before requesting another OTP.` 
          }),
          { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const now = new Date().toISOString();

    const { error: dbError } = await supabase
      .from("otp_codes")
      .insert({
        phone_number: normalizedPhone,
        otp_code: otp,
        expires_at: expiresAt.toISOString(),
        is_verified: false,
        last_otp_sent_at: now,
        failed_attempts: 0,
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
