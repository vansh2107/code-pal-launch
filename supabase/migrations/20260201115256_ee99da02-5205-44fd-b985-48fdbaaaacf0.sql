-- Create docvault_categories table
CREATE TABLE public.docvault_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.docvault_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for docvault_categories
CREATE POLICY "Users can view their own categories"
ON public.docvault_categories
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own categories"
ON public.docvault_categories
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories"
ON public.docvault_categories
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories"
ON public.docvault_categories
FOR DELETE
USING (auth.uid() = user_id);

-- Add docvault tracking columns to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS docvault_category_id UUID REFERENCES public.docvault_categories(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster category lookups
CREATE INDEX IF NOT EXISTS idx_documents_docvault_category ON public.documents(docvault_category_id);

-- Create index for frequently used queries
CREATE INDEX IF NOT EXISTS idx_documents_access_count ON public.documents(access_count DESC);

-- Create trigger for updated_at on categories
CREATE TRIGGER update_docvault_categories_updated_at
BEFORE UPDATE ON public.docvault_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();