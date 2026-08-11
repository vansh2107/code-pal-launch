import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
// @ts-ignore - worker url provided by bundler
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export interface ProcessedPdfPage {
  pageNumber: number;
  content: string; // rendered page image (data URL)
}

export interface PdfProcessingResult {
  totalPages: number;
  pages: ProcessedPdfPage[];
  failedPages: number[];
}

export class PageProcessingError extends Error {
  constructor(public pageNumber: number, message?: string) {
    super(message || `Unable to process page ${pageNumber}.`);
    this.name = "PageProcessingError";
  }
}

const MAX_PAGES = 15;
const TARGET_WIDTH = 1400;
const JPEG_QUALITY = 0.72;

async function openPdf(file: File) {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl as unknown as string;
  const arrayBuffer = await file.arrayBuffer();
  try {
    return await getDocument({ data: arrayBuffer }).promise;
  } catch (workerError) {
    console.warn("[pdf] worker failed, retrying without worker", workerError);
    const retryBuffer = await file.arrayBuffer();
    return await (getDocument as any)({ data: retryBuffer, disableWorker: true }).promise;
  }
}

/**
 * PHASE 1 helper: render/OCR-prepare a SINGLE page.
 * Returns page content only. NEVER performs document-level extraction.
 */
async function processPage(pdfDoc: any, pageNumber: number): Promise<ProcessedPdfPage> {
  const page = await pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1.0 });
  const scale = Math.min(2.5, Math.max(1.0, TARGET_WIDTH / baseViewport.width));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  if (!context) throw new PageProcessingError(pageNumber);

  await page.render({ canvasContext: context, viewport, intent: "display" } as any).promise;
  const content = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  canvas.width = 0;
  canvas.height = 0;

  if (!content || content.length < 100) throw new PageProcessingError(pageNumber);
  return { pageNumber, content };
}

/**
 * PHASE 1: process EVERY page of the PDF before any information extraction.
 * A page failure is retried once, then recorded — it never aborts the run
 * and never triggers document-level extraction.
 */
export async function processAllPages(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<PdfProcessingResult> {
  const pdfDoc = await openPdf(file);
  const totalPages = Math.min(pdfDoc.numPages, MAX_PAGES);

  const pages: ProcessedPdfPage[] = [];
  const failedPages: number[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    onProgress?.(pageNumber, totalPages);
    try {
      pages.push(await processPage(pdfDoc, pageNumber));
    } catch (firstError) {
      console.warn(`[pdf] page ${pageNumber} failed, retrying...`, firstError);
      try {
        pages.push(await processPage(pdfDoc, pageNumber));
      } catch (retryError) {
        console.error(`[pdf] page ${pageNumber} failed after retry`, retryError);
        failedPages.push(pageNumber);
      }
    }
  }

  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  return { totalPages, pages, failedPages };
}
