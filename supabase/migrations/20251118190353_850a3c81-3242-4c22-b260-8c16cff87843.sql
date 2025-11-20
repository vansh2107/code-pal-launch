-- Add local_date column to tasks table for proper date filtering
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS local_date DATE;

-- Create index for faster queries on local_date
CREATE INDEX IF NOT EXISTS idx_tasks_local_date ON tasks(local_date);

-- Update existing tasks to populate local_date based on their start_time
UPDATE tasks 
SET local_date = (start_time AT TIME ZONE timezone)::date
WHERE local_date IS NULL;