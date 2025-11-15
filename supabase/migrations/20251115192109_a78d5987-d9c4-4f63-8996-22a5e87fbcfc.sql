-- Add phone_number column to profiles table
ALTER TABLE public.profiles
ADD COLUMN phone_number text;

-- Add index for phone number lookups
CREATE INDEX idx_profiles_phone_number ON public.profiles(phone_number);

-- Create table to store OTPs temporarily
CREATE TABLE public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  otp_code text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  is_verified boolean DEFAULT false
);

-- Enable RLS on otp_codes table
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies for otp_codes
CREATE POLICY "Users can view their own OTP codes"
  ON public.otp_codes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own OTP codes"
  ON public.otp_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OTP codes"
  ON public.otp_codes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create function to delete expired OTPs
CREATE OR REPLACE FUNCTION public.delete_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.otp_codes
  WHERE expires_at < now();
END;
$$;