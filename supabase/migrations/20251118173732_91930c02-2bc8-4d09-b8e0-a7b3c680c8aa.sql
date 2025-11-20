-- Performance indexes for tasks and documents tables
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_task_date ON tasks(task_date);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_date ON tasks(user_id, status, task_date);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_expiry_date ON documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_documents_user_expiry ON documents(user_id, expiry_date);

CREATE INDEX IF NOT EXISTS idx_reminders_user_date ON reminders(user_id, reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_sent ON reminders(is_sent, reminder_date);