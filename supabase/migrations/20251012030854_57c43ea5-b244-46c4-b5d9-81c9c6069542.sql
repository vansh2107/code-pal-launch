-- Add DELETE policy for profiles table to allow users to delete their own profile
-- This provides an explicit policy even though CASCADE deletion is in place
CREATE POLICY "Users can delete their own profile"
ON profiles
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);