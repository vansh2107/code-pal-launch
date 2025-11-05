-- Unschedule old cron job if exists
SELECT cron.unschedule('send-daily-reminder-emails') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-daily-reminder-emails'
);

-- Create a cron job to run the send-reminder-emails function every hour
-- This allows the function to check each user's timezone and preferred time
SELECT cron.schedule(
  'send-hourly-reminder-emails',
  '0 * * * *', -- Run every hour at the top of the hour
  $$
  SELECT
    net.http_post(
        url:='https://rndunloczfpfbubuwffb.supabase.co/functions/v1/send-reminder-emails',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);