-- Allow deleting document_history entries when deleting an owned/authorized document
-- This enables ON DELETE CASCADE on documents -> document_history under RLS
CREATE POLICY "Users can delete history of their documents (cascade)"
ON public.document_history
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.id = document_history.document_id
      AND (
        auth.uid() = d.user_id
        OR (
          d.organization_id IS NOT NULL
          AND has_org_role(auth.uid(), d.organization_id, 'admin'::app_role)
        )
      )
  )
);