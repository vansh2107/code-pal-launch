ALTER TABLE public.routine_logs 
ADD COLUMN IF NOT EXISTS last_notified_step_id uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_notified_at timestamp with time zone DEFAULT NULL;