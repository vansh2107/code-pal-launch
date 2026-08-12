import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendOTPRequest {
  phone_number: string;
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number, email }: SendOTPRequest = await req.json();
    console.log("Sending OTP via SendGrid to:", email);

    const normalizedPhone = phone_number.replace(/[\s\-()]/g, "");

    // Basic phone format validation (E.164-ish: digits, optional +, 8-16 chars)
    if (!/^\+?[0-9]{8,16}$/.test(normalizedPhone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // IP-based rate limiting to mitigate OTP-bombing across many target numbers.
    // Limit any single source IP to 10 OTP dispatch attempts per hour.
    const sourceIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      "unknown";

    const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    if (sourceIp && sourceIp !== "unknown") {
      const { count: ipCount } = await supabase
        .from("otp_codes")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", sourceIp)
        .gte("created_at", oneHourAgoIso);

      if ((ipCount ?? 0) >= 10) {
        console.log("IP rate limit exceeded:", sourceIp);
        return new Response(
          JSON.stringify({ error: "Too many OTP requests from this network. Please try again later." }),
          { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

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
        ip_address: sourceIp,
      });

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error("Failed to store OTP");
    }

    const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY");
    if (!sendGridApiKey) {
      console.error("SENDGRID_API_KEY is not configured");
      throw new Error("Email service not configured");
    }

    const sendGridUrl = "https://api.sendgrid.com/v3/mail/send";
    const emailHtml = `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2>Remonk Reminder Verification</h2>
        <p>Hello,</p>
        <p>Your one-time password (OTP) verification code is:</p>
        <p style="font-size: 24px; font-weight: bold; color: #1E40AF; letter-spacing: 2px;">${otp}</p>
        <p>This code is valid for 10 minutes. Please do not share this code with anyone.</p>
        <br>
        <p>Best regards,<br>Team Remonk</p>
      </div>
    `;

    const emailResponse = await fetch(sendGridUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sendGridApiKey}`,
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: email }]
        }],
        from: { email: "remind659@gmail.com" },
        subject: `Your Remonk Reminder OTP Code: ${otp}`,
        content: [{
          type: "text/html",
          value: emailHtml
        }]
      })
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("SendGrid error:", errorText);
      throw new Error("Failed to send OTP email");
    }

    console.log("OTP sent successfully via SendGrid");

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
