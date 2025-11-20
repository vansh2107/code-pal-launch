-- Add a field to distinguish custom reminders from AI-generated ones
ALTER TABLE public.reminders 
ADD COLUMN IF NOT EXISTS is_custom boolean DEFAULT false;

-- Create index for better performance when filtering custom reminders
CREATE INDEX IF NOT EXISTS idx_reminders_custom ON public.reminders(document_id, is_custom) WHERE is_custom = true;