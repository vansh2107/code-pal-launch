
-- Create cron job to run document reminder scheduler every minute
-- This ensures all users receive notifications at their preferred local time
SELECT cron.schedule(
  'document-reminder-scheduler-job',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url:='https://rndunloczfpfbubuwffb.supabase.co/functions/v1/document-reminder-scheduler',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuZHVubG9jemZwZmJ1YnV3ZmZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE0MTIyMiwiZXhwIjoyMDc0NzE3MjIyfQ.bIqcOjRLsVd7rV_HMR2fSx6RDyNaTHZ-Bb5I7sGrZXc"}'::jsonb,
      body:='{}'::jsonb
    ) AS request_id;
  $$
);
