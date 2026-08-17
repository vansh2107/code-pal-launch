
import * as pdfjsLib from 'pdfjs-dist';

// IMPORTANT: You must configure the workerSrc in your app initialization (e.g. main.tsx)
// pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export class PdfProcessor {
  static async renderPageToImage(pdfData: Uint8Array, pageNumber: number): Promise<string> {
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.0 }); // High-res for OCR
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get canvas context');
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/jpeg');
  }

  static async getPageCount(pdfData: Uint8Array): Promise<number> {
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    return pdf.numPages;
  }
}
