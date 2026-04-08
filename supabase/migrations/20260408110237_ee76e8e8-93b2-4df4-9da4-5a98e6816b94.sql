
-- Remove client-facing INSERT, UPDATE, and SELECT policies from otp_codes
-- OTPs should only be managed by edge functions using service role key

DROP POLICY IF EXISTS "Users can insert their own OTP codes" ON public.otp_codes;
DROP POLICY IF EXISTS "Users can update their own OTP codes" ON public.otp_codes;
DROP POLICY IF EXISTS "Users can view their own OTP codes" ON public.otp_codes;

-- Deny all client access to otp_codes (edge functions use service role which bypasses RLS)
CREATE POLICY "Deny all client access to otp_codes" ON public.otp_codes
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);
