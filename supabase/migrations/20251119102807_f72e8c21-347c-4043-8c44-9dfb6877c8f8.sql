-- Fix document reminder cron job with correct project URL
-- The old cron job had a placeholder URL that never worked

-- First, unschedule the broken cron job
SELECT cron.unschedule('document_reminders');

-- Create new cron job with correct URL pointing to the timezone-aware document-reminder function
SELECT cron.schedule(
  'document-reminder-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT net.http_post(
    url := 'https://rndunloczfpfbubuwffb.supabase.co/functions/v1/document-reminder',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM"}'::jsonb
  ) AS request_id;
  $$
);

-- Also create the timezone-notification-scheduler cron for daily summaries
SELECT cron.schedule(
  'timezone-notification-scheduler-hourly',
  '0 * * * *', -- Every hour to check user preferred times
  $$
  SELECT net.http_post(
    url := 'https://rndunloczfpfbubuwffb.supabase.co/functions/v1/timezone-notification-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNDEyMjIsImV4cCI6MjA3NDcxNzIyMn0.DsiQcXrQKHVg1WDJjJ2aAuABv5O7KLd6-7lKxmKcDCM"}'::jsonb
  ) AS request_id;
  $$
);