
-- Routines table
CREATE TABLE public.routines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  icon TEXT DEFAULT '☀️',
  is_active BOOLEAN DEFAULT true,
  repeat_days INTEGER[] DEFAULT '{1,2,3,4,5,6,7}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Routine steps table
CREATE TABLE public.routine_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  routine_id UUID NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 5,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Routine execution logs
CREATE TABLE public.routine_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  routine_id UUID NOT NULL REFERENCES public.routines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Step completion logs
CREATE TABLE public.routine_step_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  routine_log_id UUID NOT NULL REFERENCES public.routine_logs(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.routine_steps(id) ON DELETE CASCADE,
  action TEXT NOT NULL DEFAULT 'completed',
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routine_step_logs ENABLE ROW LEVEL SECURITY;

-- Routines policies
CREATE POLICY "Users can view their own routines" ON public.routines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own routines" ON public.routines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own routines" ON public.routines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own routines" ON public.routines FOR DELETE USING (auth.uid() = user_id);

-- Routine steps policies (via routine ownership)
CREATE POLICY "Users can view steps of their routines" ON public.routine_steps FOR SELECT USING (EXISTS (SELECT 1 FROM public.routines WHERE id = routine_steps.routine_id AND user_id = auth.uid()));
CREATE POLICY "Users can create steps for their routines" ON public.routine_steps FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.routines WHERE id = routine_steps.routine_id AND user_id = auth.uid()));
CREATE POLICY "Users can update steps of their routines" ON public.routine_steps FOR UPDATE USING (EXISTS (SELECT 1 FROM public.routines WHERE id = routine_steps.routine_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete steps of their routines" ON public.routine_steps FOR DELETE USING (EXISTS (SELECT 1 FROM public.routines WHERE id = routine_steps.routine_id AND user_id = auth.uid()));

-- Routine logs policies
CREATE POLICY "Users can view their own routine logs" ON public.routine_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own routine logs" ON public.routine_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own routine logs" ON public.routine_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own routine logs" ON public.routine_logs FOR DELETE USING (auth.uid() = user_id);

-- Routine step logs policies (via routine log ownership)
CREATE POLICY "Users can view their step logs" ON public.routine_step_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.routine_logs WHERE id = routine_step_logs.routine_log_id AND user_id = auth.uid()));
CREATE POLICY "Users can create their step logs" ON public.routine_step_logs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.routine_logs WHERE id = routine_step_logs.routine_log_id AND user_id = auth.uid()));
