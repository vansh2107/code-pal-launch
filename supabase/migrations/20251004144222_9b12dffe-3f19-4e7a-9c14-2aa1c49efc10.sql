-- Fix failing inserts due to BEFORE trigger writing to document_history before parent row exists
-- Recreate documents_log_changes trigger as AFTER instead of BEFORE

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relname = 'documents'
      AND t.tgname = 'documents_log_changes'
  ) THEN
    EXECUTE 'DROP TRIGGER documents_log_changes ON public.documents;';
  END IF;
END$$;

-- AFTER trigger so FK references to documents.id are valid during logging
CREATE TRIGGER documents_log_changes
AFTER INSERT OR UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.log_document_changes();

-- Ensure updated_at trigger remains BEFORE UPDATE
DROP TRIGGER IF EXISTS documents_set_updated_at ON public.documents;
CREATE TRIGGER documents_set_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();