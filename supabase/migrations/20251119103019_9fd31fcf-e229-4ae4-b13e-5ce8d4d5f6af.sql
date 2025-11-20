-- Fix task reminder cron jobs
-- Remove broken/duplicate cron jobs and set up correct ones

-- Remove old broken cron jobs
SELECT cron.unschedule('task_two_hour_reminder');
SELECT cron.unschedule('task-two-hour-reminder-every-minute');
SELECT cron.unschedule('task-reminder-worker');
SELECT cron.unschedule('task_carry_forward');
SELECT cron.unschedule('task_incomplete');

-- Create task-two-hour-reminder - runs every 5 minutes to catch reminders reliably
SELECT cron.schedule(
  'task-two-hour-reminder',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://rndunloczfpfbubuwffb.supabase.co/functions/v1/task-two-hour-reminder',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM"}'::jsonb
  ) AS request_id;
  $$
);

-- Create task-carry-forward - runs daily at midnight to move incomplete tasks
SELECT cron.schedule(
  'task-carry-forward',
  '0 0 * * *', -- Daily at midnight UTC
  $$
  SELECT net.http_post(
    url := 'https://rndunloczfpfbubuwffb.supabase.co/functions/v1/task-carry-forward',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM"}'::jsonb
  ) AS request_id;
  $$
);

-- Create task-incomplete-reminder - runs daily at 10:00 UTC
SELECT cron.schedule(
  'task-incomplete-reminder',
  '0 10 * * *', -- Daily at 10:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://rndunloczfpfbubuwffb.supabase.co/functions/v1/task-incomplete-reminder',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM"}'::jsonb
  ) AS request_id;
  $$
);