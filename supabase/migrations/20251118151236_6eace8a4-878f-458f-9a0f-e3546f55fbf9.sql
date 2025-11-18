-- Add new fields to tasks table for 2-hour reminders
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS reminder_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamp with time zone;

-- Create index for efficient querying of active reminders
CREATE INDEX IF NOT EXISTS idx_tasks_reminder_active 
ON public.tasks(reminder_active, status, start_time) 
WHERE reminder_active = true AND status != 'completed';