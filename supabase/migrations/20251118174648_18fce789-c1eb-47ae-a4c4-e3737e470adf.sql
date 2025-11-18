-- Add performance indexes for tasks table
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_start_time ON public.tasks(start_time);
CREATE INDEX IF NOT EXISTS idx_tasks_task_date ON public.tasks(task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

-- Add performance indexes for documents table
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_expiry_date ON public.documents(expiry_date);

-- Add performance indexes for reminders table
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON public.reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_reminder_date ON public.reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_is_sent ON public.reminders(is_sent);

-- Add performance indexes for profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_timezone ON public.profiles(timezone);

-- Add performance indexes for onesignal_player_ids table
CREATE INDEX IF NOT EXISTS idx_onesignal_user_id ON public.onesignal_player_ids(user_id);