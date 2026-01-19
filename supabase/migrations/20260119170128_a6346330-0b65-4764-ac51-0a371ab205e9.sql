-- Add composite index for faster task queries by user and date
CREATE INDEX IF NOT EXISTS idx_tasks_user_task_date ON public.tasks(user_id, task_date);

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

-- Add composite index for carry-forward queries
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_date ON public.tasks(user_id, status, task_date);