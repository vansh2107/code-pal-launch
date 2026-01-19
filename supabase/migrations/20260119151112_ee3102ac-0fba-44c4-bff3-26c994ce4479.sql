-- Add storage policies for avatar uploads in the avatars folder
-- Path structure: avatars/{user_id}/profile.{ext}

-- Allow users to INSERT their own avatars
CREATE POLICY "Users can upload their own avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'document-images' 
  AND (storage.foldername(name))[1] = 'avatars' 
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to UPDATE their own avatars
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'document-images' 
  AND (storage.foldername(name))[1] = 'avatars' 
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to DELETE their own avatars
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'document-images' 
  AND (storage.foldername(name))[1] = 'avatars' 
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to SELECT/view their own avatars (for signed URLs)
CREATE POLICY "Users can view their own avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'document-images' 
  AND (storage.foldername(name))[1] = 'avatars' 
  AND (storage.foldername(name))[2] = auth.uid()::text
);