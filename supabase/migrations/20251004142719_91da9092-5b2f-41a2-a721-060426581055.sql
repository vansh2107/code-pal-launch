-- Fix delete failures: remove FK on audit_logs.document_id, correct trigger timing, and add cascade FKs

-- 1) Remove FK from audit_logs so logs can reference deleted documents
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_document_id_fkey;

-- 2) Ensure the log_document_changes trigger runs BEFORE operations on documents
DO $$
DECLARE
  trg RECORD;
BEGIN
  -- Drop any existing triggers on documents that call log_document_changes
  FOR trg IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE c.relname = 'documents'
      AND c.relnamespace = 'public'::regnamespace
      AND NOT t.tgisinternal
      AND p.proname = 'log_document_changes'
  LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(trg.tgname) || ' ON public.documents;';
  END LOOP;

  -- Create a single BEFORE trigger for INSERT/UPDATE/DELETE
  EXECUTE 'CREATE TRIGGER documents_log_changes BEFORE INSERT OR UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.log_document_changes();';
END$$;

-- 3) Ensure updated_at column is set via BEFORE UPDATE trigger
DROP TRIGGER IF EXISTS documents_set_updated_at ON public.documents;
CREATE TRIGGER documents_set_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Add ON DELETE CASCADE FKs for dependent tables
ALTER TABLE public.document_history
  DROP CONSTRAINT IF EXISTS document_history_document_id_fkey;
ALTER TABLE public.document_history
  ADD CONSTRAINT document_history_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_document_id_fkey;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
