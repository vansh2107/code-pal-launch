ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true;