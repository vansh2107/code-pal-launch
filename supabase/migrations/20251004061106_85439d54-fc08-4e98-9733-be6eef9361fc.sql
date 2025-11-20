-- Add foreign key constraint with CASCADE delete for reminders
-- This ensures that when a document is deleted, all its reminders are also deleted

-- First, drop the existing constraint if it exists (to avoid errors)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'reminders_document_id_fkey' 
        AND table_name = 'reminders'
    ) THEN
        ALTER TABLE public.reminders DROP CONSTRAINT reminders_document_id_fkey;
    END IF;
END $$;

-- Add the foreign key constraint with CASCADE delete
ALTER TABLE public.reminders
ADD CONSTRAINT reminders_document_id_fkey 
FOREIGN KEY (document_id) 
REFERENCES public.documents(id) 
ON DELETE CASCADE;

-- Also ensure document_history has CASCADE delete
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'document_history_document_id_fkey' 
        AND table_name = 'document_history'
    ) THEN
        ALTER TABLE public.document_history DROP CONSTRAINT document_history_document_id_fkey;
    END IF;
END $$;

ALTER TABLE public.document_history
ADD CONSTRAINT document_history_document_id_fkey 
FOREIGN KEY (document_id) 
REFERENCES public.documents(id) 
ON DELETE CASCADE;