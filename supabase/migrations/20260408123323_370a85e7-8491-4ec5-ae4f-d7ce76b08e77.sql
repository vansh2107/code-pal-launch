
-- Create routine_slots table for multi-time/day scheduling
CREATE TABLE public.routine_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  days_of_week integer[] NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  start_time time without time zone NOT NULL DEFAULT '07:00:00',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.routine_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view slots of their routines" ON public.routine_slots
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.routines WHERE routines.id = routine_slots.routine_id AND routines.user_id = auth.uid()));

CREATE POLICY "Users can create slots for their routines" ON public.routine_slots
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.routines WHERE routines.id = routine_slots.routine_id AND routines.user_id = auth.uid()));

CREATE POLICY "Users can update slots of their routines" ON public.routine_slots
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.routines WHERE routines.id = routine_slots.routine_id AND routines.user_id = auth.uid()));

CREATE POLICY "Users can delete slots of their routines" ON public.routine_slots
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.routines WHERE routines.id = routine_slots.routine_id AND routines.user_id = auth.uid()));

-- Index for fast lookup
CREATE INDEX idx_routine_slots_routine_id ON public.routine_slots(routine_id);
