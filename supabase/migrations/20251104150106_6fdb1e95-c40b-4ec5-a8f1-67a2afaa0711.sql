-- Create table for OneSignal player IDs
CREATE TABLE IF NOT EXISTS public.onesignal_player_ids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  player_id TEXT NOT NULL UNIQUE,
  device_info TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.onesignal_player_ids ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own player IDs" 
ON public.onesignal_player_ids 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own player IDs" 
ON public.onesignal_player_ids 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own player IDs" 
ON public.onesignal_player_ids 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own player IDs" 
ON public.onesignal_player_ids 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_onesignal_player_ids_updated_at
BEFORE UPDATE ON public.onesignal_player_ids
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();