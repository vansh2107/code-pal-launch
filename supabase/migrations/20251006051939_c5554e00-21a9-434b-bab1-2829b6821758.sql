-- Add notification preferences to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS push_notifications_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS expiry_reminders_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS renewal_reminders_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS weekly_digest_enabled boolean DEFAULT false;

-- Add email column to profiles if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_notifications ON public.profiles(email_notifications_enabled) WHERE email_notifications_enabled = true;