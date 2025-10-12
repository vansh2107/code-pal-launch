-- Security Fix: Add explicit unauthenticated access denial for profiles table
-- This prevents potential probing of the profiles table structure by unauthenticated users

-- Drop existing policies to recreate them with proper authentication enforcement
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Deny all unauthenticated access to profiles
CREATE POLICY "Deny unauthenticated access to profiles"
ON public.profiles
FOR ALL
TO anon
USING (false);

-- Allow authenticated users to view only their own profile
CREATE POLICY "Users can view only their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow authenticated users to insert their own profile
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to update their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Security Fix: Add storage RLS policies for document-images bucket (if not already present)
-- This ensures only document owners can access their own document images

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Users can view their own document images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own document images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own document images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own document images" ON storage.objects;

-- Policy for users to view their own document images
CREATE POLICY "Users can view their own document images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'document-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy for users to insert their own document images
CREATE POLICY "Users can upload their own document images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'document-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy for users to update their own document images
CREATE POLICY "Users can update their own document images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'document-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy for users to delete their own document images
CREATE POLICY "Users can delete their own document images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'document-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);