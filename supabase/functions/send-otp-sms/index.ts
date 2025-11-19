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
    console.log("Sending OTP to:", phone_number);

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

    const exotelApiKey = Deno.env.get("EXOTEL_API_KEY");
    const exotelApiToken = Deno.env.get("EXOTEL_API_TOKEN");
    const exotelSid = Deno.env.get("EXOTEL_SID");
    const exotelSenderId = Deno.env.get("EXOTEL_SENDER_ID");
    
    if (!exotelApiKey || !exotelApiToken || !exotelSid || !exotelSenderId) {
      console.error("Exotel credentials not configured");
      throw new Error("SMS service not configured");
    }

    // Exotel SMS API endpoint
    const exotelUrl = `https://api.exotel.com/v1/Accounts/${exotelSid}/Sms/send.json`;
    
    // Create Basic Auth header
    const authHeader = `Basic ${btoa(`${exotelApiKey}:${exotelApiToken}`)}`;
    
    // Prepare form data
    const formData = new URLSearchParams();
    formData.append("From", exotelSenderId);
    formData.append("To", normalizedPhone);
    formData.append("Body", `Your OTP for Softly Reminder is: ${otp}. Valid for 10 minutes.`);

    const smsResponse = await fetch(exotelUrl, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const responseData = await smsResponse.json();

    if (!smsResponse.ok) {
      console.error("Exotel error:", responseData);
      throw new Error("Failed to send SMS");
    }

    console.log("OTP sent successfully");

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
