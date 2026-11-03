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
  pageNumber: number;
  constructor(pageNumber: number, message?: string) {
    super(message || `Unable to process page ${pageNumber}.`);
    this.name = "PageProcessingError";
    this.pageNumber = pageNumber;
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
  try {
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
  } finally {
    try {
      page.cleanup();
    } catch {
      /* noop */
    }
  }
}

/**
 * PHASE 1: process EVERY page of the PDF before any information extraction.
 *
 * Progress reporting:
 * - Starts at 0 pages complete (0 / totalPages).
 * - Reports progress ONLY after a page finishes rendering (or fails retries).
 * - 100% (totalPages / totalPages) is reached ONLY when all pages are completed.
 *
 * Resource cleanup:
 * - pdfDoc.destroy() executes safely in a finally block after all pages are rendered.
 */
export async function processAllPages(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<PdfProcessingResult> {
  const pdfDoc = await openPdf(file);
  try {
    const totalPages = Math.min(pdfDoc.numPages, MAX_PAGES);

    const pages: ProcessedPdfPage[] = [];
    const failedPages: number[] = [];

    // Initial progress reporting: 0 pages processed
    onProgress?.(0, totalPages);

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      try {
        const pageResult = await processPage(pdfDoc, pageNumber);
        pages.push(pageResult);
      } catch (firstError) {
        console.warn(`[pdf] page ${pageNumber} failed, retrying...`, firstError);
        try {
          const retryResult = await processPage(pdfDoc, pageNumber);
          pages.push(retryResult);
        } catch (retryError) {
          console.error(`[pdf] page ${pageNumber} failed after retry`, retryError);
          failedPages.push(pageNumber);
        }
      } finally {
        // Report progress only AFTER this page has completed (success or failure)
        onProgress?.(pageNumber, totalPages);
      }
    }

    pages.sort((a, b) => a.pageNumber - b.pageNumber);
    return { totalPages, pages, failedPages };
  } finally {
    try {
      await pdfDoc.destroy();
    } catch (destroyErr) {
      console.warn("[pdf] Error destroying pdfDoc instance:", destroyErr);
    }
  }
}
