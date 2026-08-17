
import { supabase } from '@/integrations/supabase/client';

export interface OcrResult {
  text: string;
  fields: Record<string, any>;
  confidence: number;
}

export class OcrEngine {
  static async extract(imageBase64: string): Promise<OcrResult> {
    console.log('Sending image to document analyzer...');
    
    // Call the existing Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('document-analyzer', { 
      body: { image: imageBase64 } 
    });

    if (error) {
      console.error('Error calling document-analyzer:', error);
      throw new Error(`OCR extraction failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from document analyzer');
    }

    // Map the response structure:
    // { "documentType": string, "fields": { "field_name": "value" }, "confidence": number, "sourcePage": number }
    // to OcrResult:
    // { text: string, fields: Record<string, any>, confidence: number }
    return {
      text: data.documentType || '',
      fields: data.fields || {},
      confidence: data.confidence || 0
    };
  }
}
