import { DocumentScannerOptions, ProcessingResult, ExtractedField } from './types';
import { PdfProcessor } from './pdf-processor';
import { ImageUtils } from './image-utils';
import { OcrEngine } from './ocr-engine';

export class DocumentProcessor {
  private options: DocumentScannerOptions;

  constructor(options: Partial<DocumentScannerOptions> = {}) {
    this.options = {
      enableAutoCrop: true,
      enableDeskew: true,
      enableOCR: true,
      ...options
    };
  }

  async processFile(file: File | Blob): Promise<ProcessingResult> {
    const startTime = performance.now();
    
    // 1. Determine type
    const isPdf = file.type === 'application/pdf';
    
    let pages: { image: string, pageNumber: number }[] = [];

    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const pageCount = await PdfProcessor.getPageCount(uint8Array);
      
      for (let i = 1; i <= pageCount; i++) {
        const image = await PdfProcessor.renderPageToImage(uint8Array, i);
        pages.push({ image, pageNumber: i });
      }
    } else {
      // Convert image blob/file to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      pages.push({ image: base64, pageNumber: 1 });
    }

    // 2. Process all pages
    const allFields: ExtractedField[] = [];
    
    for (const page of pages) {
      // Preprocess image
      const img = new Image();
      img.src = page.image;
      await new Promise((resolve) => img.onload = resolve);
      
      const processedImage = await ImageUtils.toGrayscale(img);
      
      // Extraction
      const result = await OcrEngine.extract(processedImage);
      
      // Merge results
      Object.entries(result.fields).forEach(([key, value]) => {
        allFields.push({
          field: key,
          value,
          confidence: result.confidence,
          sourcePage: page.pageNumber
        });
      });
    }

    return {
      documentId: crypto.randomUUID(),
      originalFileName: (file as File).name || 'unknown',
      processedImage: pages[0].image,
      documentType: 'other',
      fields: allFields,
      confidence: 0.9,
      metadata: { 
        confidence: 0.9, 
        processingTimeMs: performance.now() - startTime 
      }
    };
  }
}
