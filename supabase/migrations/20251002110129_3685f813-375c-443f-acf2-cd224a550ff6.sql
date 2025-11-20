-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'viewer');

-- Create organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create organization_members table (links users to organizations with roles)
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(organization_id, user_id)
);

-- Add organization_id to documents table
ALTER TABLE public.documents ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Enable RLS on new tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user role in organization
CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role = _role
  )
$$;

-- Create function to get user's role in organization
CREATE OR REPLACE FUNCTION public.get_user_org_role(_user_id UUID, _org_id UUID)
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.organization_members
  WHERE user_id = _user_id
    AND organization_id = _org_id
  LIMIT 1
$$;

-- Create function to check if user is member of organization
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
  )
$$;

-- RLS Policies for organizations table
CREATE POLICY "Users can view organizations they are members of"
ON public.organizations FOR SELECT
USING (
  auth.uid() = owner_id OR
  public.is_org_member(auth.uid(), id)
);

CREATE POLICY "Users can create organizations"
ON public.organizations FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Organization owners and admins can update organizations"
ON public.organizations FOR UPDATE
USING (
  auth.uid() = owner_id OR
  public.has_org_role(auth.uid(), id, 'admin')
);

CREATE POLICY "Only organization owners can delete organizations"
ON public.organizations FOR DELETE
USING (auth.uid() = owner_id);

-- RLS Policies for organization_members table
CREATE POLICY "Users can view members of their organizations"
ON public.organization_members FOR SELECT
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Organization owners and admins can add members"
ON public.organization_members FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = organization_id
    AND owner_id = auth.uid()
  ) OR
  public.has_org_role(auth.uid(), organization_id, 'admin')
);

CREATE POLICY "Organization owners and admins can update member roles"
ON public.organization_members FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = organization_id
    AND owner_id = auth.uid()
  ) OR
  public.has_org_role(auth.uid(), organization_id, 'admin')
);

CREATE POLICY "Organization owners and admins can remove members"
ON public.organization_members FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = organization_id
    AND owner_id = auth.uid()
  ) OR
  public.has_org_role(auth.uid(), organization_id, 'admin')
);

-- Update documents RLS policies to support organization access
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
CREATE POLICY "Users can view their documents and organization documents"
ON public.documents FOR SELECT
USING (
  auth.uid() = user_id OR
  (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
);

DROP POLICY IF EXISTS "Users can create their own documents" ON public.documents;
CREATE POLICY "Users can create documents"
ON public.documents FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  (organization_id IS NULL OR public.is_org_member(auth.uid(), organization_id))
);

DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
CREATE POLICY "Users can update documents"
ON public.documents FOR UPDATE
USING (
  auth.uid() = user_id OR
  (organization_id IS NOT NULL AND (
    public.has_org_role(auth.uid(), organization_id, 'admin') OR
    public.has_org_role(auth.uid(), organization_id, 'editor')
  ))
);

DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
CREATE POLICY "Users can delete documents"
ON public.documents FOR DELETE
USING (
  auth.uid() = user_id OR
  (organization_id IS NOT NULL AND public.has_org_role(auth.uid(), organization_id, 'admin'))
);

-- Create trigger for organizations updated_at
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for new tables
ALTER TABLE public.organizations REPLICA IDENTITY FULL;
ALTER TABLE public.organization_members REPLICA IDENTITY FULL;