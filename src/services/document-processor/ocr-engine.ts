// @ts-nocheck

import { callDocumentAnalyzer } from '@/integrations/firebase/functions';

export interface OcrResult {
  text: string;
  fields: Record<string, any>;
  confidence: number;
}

export class OcrEngine {
  static async extract(imageBase64: string): Promise<OcrResult> {
    console.log('Sending image to document analyzer...');
    
    const data = await callDocumentAnalyzer({ 
      image: imageBase64 
    } as any);

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
