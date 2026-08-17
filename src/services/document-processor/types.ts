
export type DocumentType = 
  | 'identity' 
  | 'passport' 
  | 'license' 
  | 'invoice' 
  | 'receipt' 
  | 'medical' 
  | 'contract' 
  | 'other';

export interface ProcessingMetadata {
  confidence: number;
  sourcePage?: number;
  processingTimeMs: number;
}

export interface ExtractedField {
  field: string;
  value: string | number | Date | null;
  confidence: number;
  sourcePage?: number;
}

export interface ProcessingResult {
  documentId: string;
  originalFileName: string;
  processedImage: string; // Base64 or Blob URL
  documentType: DocumentType;
  fields: ExtractedField[];
  confidence: number;
  metadata: ProcessingMetadata;
}

export interface DocumentScannerOptions {
  enableAutoCrop: boolean;
  enableDeskew: boolean;
  enableOCR: boolean;
  ocrProvider?: 'tesseract' | 'google-vision' | 'aws-textract' | 'custom';
}
