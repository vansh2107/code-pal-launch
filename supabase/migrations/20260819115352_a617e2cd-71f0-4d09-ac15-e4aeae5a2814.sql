CREATE POLICY "Users can view their own documents folder"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'document-images'
  AND (storage.foldername(name))[1] = 'documents'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Users can update their own documents folder"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'document-images'
  AND (storage.foldername(name))[1] = 'documents'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);

CREATE POLICY "Users can delete their own documents folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'document-images'
  AND (storage.foldername(name))[1] = 'documents'
  AND (storage.foldername(name))[2] = (auth.uid())::text
);