-- Add expiry_date_label column to store custom date label (e.g. "Payment Due Date")
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS expiry_date_label TEXT;
