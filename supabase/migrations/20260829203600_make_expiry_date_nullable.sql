-- Make expiry_date column nullable if it is not already
ALTER TABLE public.documents ALTER COLUMN expiry_date DROP NOT NULL;

-- Clean up any incorrectly generated epoch/default dates (like 1969-12-31 or 1970-01-01)
UPDATE public.documents
SET expiry_date = NULL
WHERE expiry_date = '1969-12-31'::date OR expiry_date = '1970-01-01'::date;
