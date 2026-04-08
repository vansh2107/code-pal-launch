
-- 1. Create new routine_tasks table
CREATE TABLE public.routine_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  routine_id UUID NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Create new routine_task_slots table
CREATE TABLE public.routine_task_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.routine_tasks(id) ON DELETE CASCADE,
  time TIME WITHOUT TIME ZONE NOT NULL DEFAULT '07:00:00',
  days_of_week INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.routine_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_task_slots ENABLE ROW LEVEL SECURITY;

-- 4. RLS for routine_tasks (via routines ownership)
CREATE POLICY "Users can view tasks of their routines" ON public.routine_tasks
  FOR SELECT USING (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_tasks.routine_id AND routines.user_id = auth.uid()));

CREATE POLICY "Users can create tasks for their routines" ON public.routine_tasks
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_tasks.routine_id AND routines.user_id = auth.uid()));

CREATE POLICY "Users can update tasks of their routines" ON public.routine_tasks
  FOR UPDATE USING (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_tasks.routine_id AND routines.user_id = auth.uid()));

CREATE POLICY "Users can delete tasks of their routines" ON public.routine_tasks
  FOR DELETE USING (EXISTS (SELECT 1 FROM routines WHERE routines.id = routine_tasks.routine_id AND routines.user_id = auth.uid()));

-- 5. RLS for routine_task_slots (via routine_tasks -> routines ownership)
CREATE POLICY "Users can view slots of their tasks" ON public.routine_task_slots
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM routine_tasks rt JOIN routines r ON r.id = rt.routine_id
    WHERE rt.id = routine_task_slots.task_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "Users can create slots for their tasks" ON public.routine_task_slots
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM routine_tasks rt JOIN routines r ON r.id = rt.routine_id
    WHERE rt.id = routine_task_slots.task_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "Users can update slots of their tasks" ON public.routine_task_slots
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM routine_tasks rt JOIN routines r ON r.id = rt.routine_id
    WHERE rt.id = routine_task_slots.task_id AND r.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete slots of their tasks" ON public.routine_task_slots
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM routine_tasks rt JOIN routines r ON r.id = rt.routine_id
    WHERE rt.id = routine_task_slots.task_id AND r.user_id = auth.uid()
  ));

-- 6. Drop old tables (CASCADE will handle FKs)
DROP TABLE IF EXISTS public.routine_step_logs CASCADE;
DROP TABLE IF EXISTS public.routine_logs CASCADE;
DROP TABLE IF EXISTS public.routine_streaks CASCADE;
DROP TABLE IF EXISTS public.routine_steps CASCADE;
DROP TABLE IF EXISTS public.routine_slots CASCADE;

-- 7. Simplify routines table - drop unused columns
ALTER TABLE public.routines
  DROP COLUMN IF EXISTS mode,
  DROP COLUMN IF EXISTS auto_adjust,
  DROP COLUMN IF EXISTS start_time,
  DROP COLUMN IF EXISTS end_time,
  DROP COLUMN IF EXISTS repeat_type,
  DROP COLUMN IF EXISTS repeat_days,
  DROP COLUMN IF EXISTS notifications_enabled,
  DROP COLUMN IF EXISTS category;
