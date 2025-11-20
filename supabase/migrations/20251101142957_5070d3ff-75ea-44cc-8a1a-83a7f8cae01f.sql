-- Add 'tickets_and_fines' to the document_type enum
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'tickets_and_fines';