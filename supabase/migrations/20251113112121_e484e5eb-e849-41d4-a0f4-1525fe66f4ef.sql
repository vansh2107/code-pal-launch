-- Add unique constraint to reminders table
ALTER TABLE public.reminders 
ADD CONSTRAINT reminders_document_reminder_date_unique 
UNIQUE (document_id, reminder_date);

-- Function to create reminders for a document
CREATE OR REPLACE FUNCTION public.create_document_reminders()
RETURNS TRIGGER AS $$
DECLARE
  reminder_intervals INTEGER[] := ARRAY[30, 14, 7, 3, 1]; -- Days before expiry
  interval_day INTEGER;
  reminder_date DATE;
BEGIN
  -- Only create reminders for future expiry dates
  IF NEW.expiry_date > CURRENT_DATE THEN
    -- Delete existing reminders for this document if expiry date changed
    IF TG_OP = 'UPDATE' AND OLD.expiry_date <> NEW.expiry_date THEN
      DELETE FROM public.reminders WHERE document_id = NEW.id;
    END IF;
    
    -- Create reminders at standard intervals
    FOREACH interval_day IN ARRAY reminder_intervals
    LOOP
      reminder_date := NEW.expiry_date - interval_day;
      
      -- Only create reminder if date is in the future
      IF reminder_date >= CURRENT_DATE THEN
        INSERT INTO public.reminders (document_id, user_id, reminder_date, is_sent, is_custom)
        VALUES (NEW.id, NEW.user_id, reminder_date, false, false)
        ON CONFLICT (document_id, reminder_date) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for automatic reminder generation
DROP TRIGGER IF EXISTS create_reminders_on_document_change ON public.documents;
CREATE TRIGGER create_reminders_on_document_change
  AFTER INSERT OR UPDATE OF expiry_date ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.create_document_reminders();

-- Create reminders for existing documents
INSERT INTO public.reminders (document_id, user_id, reminder_date, is_sent, is_custom)
SELECT 
  d.id,
  d.user_id,
  d.expiry_date - interval_day,
  false,
  false
FROM 
  public.documents d,
  unnest(ARRAY[30, 14, 7, 3, 1]) AS interval_day
WHERE 
  d.expiry_date > CURRENT_DATE
  AND (d.expiry_date - interval_day) >= CURRENT_DATE
ON CONFLICT (document_id, reminder_date) DO NOTHING;

-- Update the hourly cron job to run every 30 minutes for better timezone coverage
SELECT cron.unschedule('send-hourly-reminder-emails');
SELECT cron.schedule(
  'send-reminder-emails-every-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rndunloczfpfbubuwffb.supabase.co/functions/v1/send-reminder-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'vansh'
    ),
    body := jsonb_build_object('time', now())
  );
  $$
);