-- Create storage bucket for document images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-images',
  'document-images',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
);

-- Add image_path column to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS image_path TEXT;

-- Storage RLS policies for document images
CREATE POLICY "Users can upload their own document images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'document-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own document images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'document-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Organization members can view org document images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'document-images' AND
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.image_path = name
    AND d.organization_id IS NOT NULL
    AND public.is_org_member(auth.uid(), d.organization_id)
  )
);

CREATE POLICY "Users can delete their own document images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'document-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Strengthen organization_members RLS policies
-- Drop existing update policy and recreate with owner protection
DROP POLICY IF EXISTS "Organization owners and admins can update member roles" ON public.organization_members;

CREATE POLICY "Organization owners and admins can update member roles"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (
  -- Can update if you're the owner or admin
  (
    EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = organization_members.organization_id
      AND owner_id = auth.uid()
    ) OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  )
  -- Cannot update your own role
  AND user_id <> auth.uid()
  -- Cannot change the owner's role
  AND NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = organization_members.organization_id
    AND owner_id = organization_members.user_id
  )
)
WITH CHECK (
  -- Same checks for the new values
  (
    EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = organization_members.organization_id
      AND owner_id = auth.uid()
    ) OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  )
  AND user_id <> auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = organization_members.organization_id
    AND owner_id = organization_members.user_id
  )
);

-- Add constraint to limit notes field length
ALTER TABLE public.documents
ADD CONSTRAINT documents_notes_length_check
CHECK (length(notes) <= 5000);

-- Enhanced audit logging trigger for role changes
CREATE OR REPLACE FUNCTION public.log_role_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.role <> NEW.role) THEN
    INSERT INTO public.audit_logs (
      user_id,
      action,
      entity_type,
      changes
    )
    VALUES (
      auth.uid(),
      'role_change',
      'organization_member',
      jsonb_build_object(
        'organization_id', NEW.organization_id,
        'target_user_id', NEW.user_id,
        'old_role', OLD.role,
        'new_role', NEW.role
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_member_role_changes
AFTER UPDATE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.log_role_changes();