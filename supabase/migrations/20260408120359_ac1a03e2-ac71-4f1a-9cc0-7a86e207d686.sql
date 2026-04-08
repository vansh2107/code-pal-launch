
-- Table to track sent routine notifications for deduplication
CREATE TABLE public.routine_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_key text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  routine_id uuid NOT NULL,
  step_id uuid,
  notification_type text NOT NULL, -- 'step_start', 'nudge', 'preview'
  sent_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for cleanup queries
CREATE INDEX idx_routine_notification_log_sent_at ON public.routine_notification_log (sent_at);
CREATE INDEX idx_routine_notification_log_user ON public.routine_notification_log (user_id, routine_id);

-- RLS: only service role needs access (edge functions use service role key)
ALTER TABLE public.routine_notification_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (no public access needed)
CREATE POLICY "Service role full access" ON public.routine_notification_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
