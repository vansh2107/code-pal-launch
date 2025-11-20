-- Add explicit DENY policies for audit logs to ensure immutability
-- This prevents users from modifying or deleting their audit trail records

-- Create explicit DENY policy for UPDATE operations on audit_logs
CREATE POLICY "audit_logs_deny_update" 
ON public.audit_logs 
FOR UPDATE 
USING (false);

-- Create explicit DENY policy for DELETE operations on audit_logs
CREATE POLICY "audit_logs_deny_delete" 
ON public.audit_logs 
FOR DELETE 
USING (false);

-- Add comment explaining the immutability requirement
COMMENT ON TABLE public.audit_logs IS 'Audit logs are immutable by design. UPDATE and DELETE operations are explicitly denied to maintain audit trail integrity.';