-- Update cron schedules to run hourly for timezone awareness
-- This ensures carry-forward and incomplete reminders work for all user timezones

-- Update task-carry-forward to run every hour to catch midnight in all timezones
SELECT cron.unschedule('task-carry-forward');
SELECT cron.schedule(
  'task-carry-forward',
  '0 * * * *', -- Every hour (to catch midnight in different timezones)
  $$
  SELECT net.http_post(
    url := 'https://rndunloczfpfbubuwffb.supabase.co/functions/v1/task-carry-forward',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM"}'::jsonb
  ) AS request_id;
  $$
);

-- Update task-incomplete-reminder to run every hour (checks user preferred times)
SELECT cron.unschedule('task-incomplete-reminder');
SELECT cron.schedule(
  'task-incomplete-reminder',
  '0 * * * *', -- Every hour (to catch user preferred notification times)
  $$
  SELECT net.http_post(
    url := 'https://rndunloczfpfbubuwffb.supabase.co/functions/v1/task-incomplete-reminder',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM"}'::jsonb
  ) AS request_id;
  $$
);