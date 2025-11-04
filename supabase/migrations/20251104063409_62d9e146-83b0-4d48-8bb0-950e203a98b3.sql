-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to run the send-reminder-emails function daily at 9 AM UTC (2:30 PM IST)
SELECT cron.schedule(
  'send-daily-reminder-emails',
  '0 9 * * *', -- Run at 9 AM UTC every day (2:30 PM IST)
  $$
  SELECT
    net.http_post(
        url:='https://rndunloczfpfbubuwffb.supabase.co/functions/v1/send-reminder-emails',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);