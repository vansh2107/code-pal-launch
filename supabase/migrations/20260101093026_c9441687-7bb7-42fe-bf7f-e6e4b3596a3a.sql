-- Create document-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-images', 'document-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload their own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'document-images' AND
  (storage.foldername(name))[1] = 'documents' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow authenticated users to view their own documents
CREATE POLICY "Users can view their own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'document-images' AND
  (storage.foldername(name))[1] = 'documents' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow authenticated users to delete their own documents
CREATE POLICY "Users can delete their own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'document-images' AND
  (storage.foldername(name))[1] = 'documents' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow public read access for document images (since bucket is public)
CREATE POLICY "Public can view document images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'document-images');