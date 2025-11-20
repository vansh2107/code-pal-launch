-- Add category_detail to store fine-grained document category while preserving enum document_type
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS category_detail TEXT;

-- Optional: No change to RLS needed since table policies already restrict by user_id/organization_id
-- Backfill strategy: leave NULL; UI will fall back to document_type when category_detail is missing

-- Update updated_at trigger if exists (none defined specifically for documents). Keeping unchanged.