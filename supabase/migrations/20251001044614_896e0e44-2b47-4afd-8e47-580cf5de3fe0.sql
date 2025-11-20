-- Create document_history table for tracking renewals
CREATE TABLE public.document_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'renewed', 'created', 'updated'
  old_expiry_date DATE,
  new_expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own document history"
ON public.document_history
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own document history"
ON public.document_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create audit_logs table for tracking all changes
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'view'
  entity_type TEXT NOT NULL, -- 'document', 'reminder', 'profile'
  changes JSONB, -- Store what changed
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own audit logs"
ON public.audit_logs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create function to log document changes
CREATE OR REPLACE FUNCTION public.log_document_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.document_history (document_id, user_id, action, new_expiry_date, notes)
    VALUES (NEW.id, NEW.user_id, 'created', NEW.expiry_date, 'Document created');
    
    INSERT INTO public.audit_logs (user_id, document_id, action, entity_type, changes)
    VALUES (NEW.user_id, NEW.id, 'create', 'document', to_jsonb(NEW));
    
    RETURN NEW;
    
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Check if expiry date changed (renewal)
    IF OLD.expiry_date <> NEW.expiry_date THEN
      INSERT INTO public.document_history (document_id, user_id, action, old_expiry_date, new_expiry_date, notes)
      VALUES (NEW.id, NEW.user_id, 'renewed', OLD.expiry_date, NEW.expiry_date, 'Document renewed');
    END IF;
    
    INSERT INTO public.audit_logs (user_id, document_id, action, entity_type, changes)
    VALUES (NEW.user_id, NEW.id, 'update', 'document', 
      jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
    
    RETURN NEW;
    
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_logs (user_id, document_id, action, entity_type, changes)
    VALUES (OLD.user_id, OLD.id, 'delete', 'document', to_jsonb(OLD));
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create trigger for document changes
CREATE TRIGGER document_changes_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.log_document_changes();

-- Add index for performance
CREATE INDEX idx_document_history_document_id ON public.document_history(document_id);
CREATE INDEX idx_document_history_user_id ON public.document_history(user_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_document_id ON public.audit_logs(document_id);