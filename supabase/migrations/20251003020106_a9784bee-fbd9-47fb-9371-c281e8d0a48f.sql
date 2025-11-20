-- Phase 1: Fix privilege escalation vulnerability in organization_members
-- Prevent users from changing their own role
DROP POLICY IF EXISTS "Organization owners and admins can update member roles" ON public.organization_members;

CREATE POLICY "Organization owners and admins can update member roles"
ON public.organization_members
FOR UPDATE
USING (
  (
    EXISTS (
      SELECT 1 FROM organizations 
      WHERE id = organization_members.organization_id 
      AND owner_id = auth.uid()
    )
    OR has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  )
  -- CRITICAL: Prevent users from escalating their own privileges
  AND user_id != auth.uid()
);

-- Phase 1: Remove email column from profiles table (already in auth.users)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;

-- Update the handle_new_user trigger to not insert email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name')
  );
  RETURN NEW;
END;
$$;

-- Phase 3: Add explicit DENY policies for document_history
CREATE POLICY "No one can update document history"
ON public.document_history
FOR UPDATE
USING (false);

CREATE POLICY "No one can delete document history"
ON public.document_history
FOR DELETE
USING (false);

-- Add constraint to prevent self-role escalation at database level
ALTER TABLE public.organization_members
DROP CONSTRAINT IF EXISTS prevent_self_role_change;

-- Note: We can't add a constraint that references auth.uid() as it's session-based
-- The RLS policy above is the primary defense