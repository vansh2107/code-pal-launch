-- Add country field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN country text;

-- Add index for better query performance
CREATE INDEX idx_profiles_country ON public.profiles(country);