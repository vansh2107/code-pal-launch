// Render ALL pages of a PDF to JPEG data URLs, in original order.
// Uses pdfjs-dist which is already a project dependency.
// @ts-ignore - path is provided by pdfjs-dist package
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl as unknown as string;

export interface RenderedPage {
  pageNumber: number;
  dataUrl: string;
}

const MAX_WIDTH = 1400;
const JPEG_QUALITY = 0.72;

/**
 * Renders every page of the PDF in order.
 * onProgress is called with (currentPage, totalPages) as each page finishes.
 */
export async function renderAllPdfPages(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<RenderedPage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await getDocument({ data: arrayBuffer }).promise;
  const total = pdfDoc.numPages;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdfDoc.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_WIDTH / baseViewport.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create canvas context");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas } as any).promise;

    pages.push({ pageNumber: i, dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY) });
    canvas.width = 0;
    canvas.height = 0;
    onProgress?.(i, total);
  }

  return pages;
}
