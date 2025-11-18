-- Create cron job for 2-hour task reminders (runs every 5 minutes)
SELECT cron.schedule(
  'task-two-hour-reminder-every-5min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://rndunloczfpfbubuwffb.supabase.co/functions/v1/task-two-hour-reminder',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);