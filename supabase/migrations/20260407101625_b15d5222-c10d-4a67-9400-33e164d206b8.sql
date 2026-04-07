
-- 1. Extend routines table with engine fields
ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS start_time time without time zone,
  ADD COLUMN IF NOT EXISTS end_time time without time zone,
  ADD COLUMN IF NOT EXISTS repeat_type text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'flexible',
  ADD COLUMN IF NOT EXISTS auto_adjust boolean NOT NULL DEFAULT true;

-- 2. Extend routine_steps with scheduling fields
ALTER TABLE public.routine_steps
  ADD COLUMN IF NOT EXISTS start_offset_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_type text NOT NULL DEFAULT 'smart';

-- 3. Extend routine_logs (executions) with date and mode snapshot
ALTER TABLE public.routine_logs
  ADD COLUMN IF NOT EXISTS execution_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'flexible',
  ADD COLUMN IF NOT EXISTS auto_adjust boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discipline_score integer DEFAULT 100;

-- 4. Extend routine_step_logs (task executions) with timing analytics
ALTER TABLE public.routine_step_logs
  ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS activated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS delay_seconds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rescheduled_to timestamp with time zone;

-- 5. Create routine_streaks table for analytics
CREATE TABLE IF NOT EXISTS public.routine_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_completed_date date,
  total_completions integer NOT NULL DEFAULT 0,
  total_skips integer NOT NULL DEFAULT 0,
  avg_discipline_score numeric(5,2) DEFAULT 100.00,
  avg_delay_seconds integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, routine_id)
);

-- 6. Enable RLS on routine_streaks
ALTER TABLE public.routine_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streaks"
  ON public.routine_streaks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own streaks"
  ON public.routine_streaks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streaks"
  ON public.routine_streaks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own streaks"
  ON public.routine_streaks FOR DELETE
  USING (auth.uid() = user_id);

-- 7. Updated_at trigger for routine_streaks
CREATE TRIGGER update_routine_streaks_updated_at
  BEFORE UPDATE ON public.routine_streaks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
