import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyOTPRequest {
  phone_number: string;
  otp_code: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone_number, otp_code }: VerifyOTPRequest = await req.json();
    console.log("Verifying OTP for:", phone_number);

    const normalizedPhone = phone_number.replace(/[\s\-()]/g, "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: otpRecord, error: fetchError } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("phone_number", normalizedPhone)
      .eq("is_verified", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !otpRecord) {
      console.error("OTP not found:", fetchError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired OTP" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const expiresAt = new Date(otpRecord.expires_at);
    if (expiresAt < new Date()) {
      console.log("OTP expired");
      return new Response(
        JSON.stringify({ error: "OTP has expired" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (otpRecord.otp_code !== otp_code) {
      console.log("Invalid OTP code");
      return new Response(
        JSON.stringify({ error: "Invalid OTP code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { error: updateError } = await supabase
      .from("otp_codes")
      .update({ is_verified: true })
      .eq("id", otpRecord.id);

    if (updateError) {
      console.error("Failed to mark OTP as verified:", updateError);
      throw new Error("Failed to verify OTP");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, email")
      .eq("phone_number", normalizedPhone)
      .single();

    if (profileError || !profile) {
      console.error("User not found:", profileError);
      return new Response(
        JSON.stringify({ error: "User not found with this phone number" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("OTP verified successfully for user:", profile.user_id);

    return new Response(
      JSON.stringify({ success: true, user_id: profile.user_id, email: profile.email }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in verify-otp:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
