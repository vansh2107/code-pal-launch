-- Create notification_tokens table for storing FCM and OneSignal tokens
CREATE TABLE IF NOT EXISTS public.notification_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('fcm', 'onesignal')),
  device_info TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, token, provider)
);

-- Enable RLS
ALTER TABLE public.notification_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own tokens"
  ON public.notification_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tokens"
  ON public.notification_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tokens"
  ON public.notification_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tokens"
  ON public.notification_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_notification_tokens_user_id ON public.notification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_tokens_provider ON public.notification_tokens(provider);

-- Create trigger for updated_at
CREATE TRIGGER update_notification_tokens_updated_at
  BEFORE UPDATE ON public.notification_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();