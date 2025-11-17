-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  total_time_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'carried')),
  image_path TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  consecutive_missed_days INTEGER DEFAULT 0,
  original_date DATE NOT NULL,
  task_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own tasks"
  ON public.tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
  ON public.tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks"
  ON public.tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Create storage bucket for task images
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-images', 'task-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for task images
CREATE POLICY "Users can view task images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'task-images');

CREATE POLICY "Users can upload their own task images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'task-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own task images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'task-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own task images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'task-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Trigger to update updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for better query performance
CREATE INDEX idx_tasks_user_date ON public.tasks(user_id, task_date);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_start_time ON public.tasks(start_time);