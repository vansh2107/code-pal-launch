-- Add rate limiting and brute force protection columns to otp_codes table
ALTER TABLE public.otp_codes 
ADD COLUMN IF NOT EXISTS last_otp_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups on phone_number and locked status
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_locked 
ON public.otp_codes(phone_number, locked_until);

-- Create index for faster lookups on expiration
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at 
ON public.otp_codes(expires_at);

-- Update the profiles table RLS policies to be more explicit
-- Drop the ambiguous ALL policy and replace with specific operation policies
DROP POLICY IF EXISTS "Deny unauthenticated access to profiles" ON public.profiles;

-- Create explicit deny policies for unauthenticated users on each operation
CREATE POLICY "Unauthenticated users cannot select profiles"
ON public.profiles
FOR SELECT
TO anon
USING (false);

CREATE POLICY "Unauthenticated users cannot insert profiles"
ON public.profiles
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "Unauthenticated users cannot update profiles"
ON public.profiles
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "Unauthenticated users cannot delete profiles"
ON public.profiles
FOR DELETE
TO anon
USING (false);