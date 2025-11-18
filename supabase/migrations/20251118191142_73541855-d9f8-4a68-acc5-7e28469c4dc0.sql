-- Add start_notified field to tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS start_notified boolean DEFAULT false;

-- Create index for efficient querying of pending notifications
CREATE INDEX IF NOT EXISTS idx_tasks_pending_notifications 
ON tasks(user_id, status, start_notified, local_date) 
WHERE status = 'pending' AND start_notified = false;