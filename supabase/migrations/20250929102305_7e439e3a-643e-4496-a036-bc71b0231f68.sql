-- Create document types enum
CREATE TYPE public.document_type AS ENUM (
  'license',
  'passport', 
  'permit',
  'insurance',
  'certification',
  'other'
);

-- Create documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document_type public.document_type NOT NULL,
  issuing_authority TEXT,
  expiry_date DATE NOT NULL,
  renewal_period_days INTEGER DEFAULT 30,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for documents
CREATE POLICY "Users can view their own documents" 
ON public.documents 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own documents" 
ON public.documents 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents" 
ON public.documents 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents" 
ON public.documents 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create reminders table
CREATE TABLE public.reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_date DATE NOT NULL,
  is_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for reminders
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for reminders
CREATE POLICY "Users can view their own reminders" 
ON public.reminders 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reminders" 
ON public.reminders 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reminders" 
ON public.reminders 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reminders" 
ON public.reminders 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create user profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name'),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- Create trigger for automatic profile creation
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();