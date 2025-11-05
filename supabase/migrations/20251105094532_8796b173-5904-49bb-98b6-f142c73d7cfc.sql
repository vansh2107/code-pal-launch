-- Add timezone and notification time preferences to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS preferred_notification_time TIME DEFAULT '09:00:00';