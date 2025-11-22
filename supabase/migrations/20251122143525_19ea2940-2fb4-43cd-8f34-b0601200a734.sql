-- Add last_overdue_alert_sent column to tasks table for tracking overdue notifications
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_overdue_alert_sent TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN tasks.last_overdue_alert_sent IS 'Timestamp of last overdue alert notification sent for this task';

-- Add indexes for better query performance on task queries
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_task_date ON tasks(task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_date ON tasks(user_id, status, task_date);

-- Add indexes for document queries
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_expiry_date ON documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_documents_user_expiry ON documents(user_id, expiry_date);

-- Add index for reminders
CREATE INDEX IF NOT EXISTS idx_reminders_user_date ON reminders(user_id, reminder_date, is_sent);