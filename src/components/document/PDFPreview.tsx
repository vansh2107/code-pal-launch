import { useState, useEffect, useRef, useCallback, memo } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { FileText, Loader2 } from "lucide-react";

interface PDFPreviewProps {
  pdfUrl: string;
  className?: string;
  onClick?: () => void;
  /** Preview width - affects rendering quality */
  width?: number;
}

/**
 * High-quality first-page PDF preview component.
 * Renders only the first page directly to canvas at high resolution.
 * Does NOT convert to JPEG - maintains vector sharpness.
 */
export const PDFPreview = memo(function PDFPreview({ 
  pdfUrl, 
  className = "", 
  onClick,
  width = 400 
}: PDFPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);

  const renderFirstPage = useCallback(async () => {
    if (!pdfUrl || !canvasRef.current) return;

    // Cancel previous render if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(false);

    try {
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl as unknown as string;

      const response = await fetch(pdfUrl, { 
        signal: abortControllerRef.current.signal 
      });
      
      if (!response.ok) throw new Error('Failed to fetch PDF');
      
      const arrayBuffer = await response.arrayBuffer();

      // Load PDF document
      let pdfDoc: any;
      try {
        pdfDoc = await getDocument({ data: arrayBuffer }).promise;
      } catch (wErr) {
        console.warn('PDF worker failed, retrying without worker...', wErr);
        pdfDoc = await (getDocument as any)({ data: arrayBuffer, disableWorker: true }).promise;
      }

      // Get first page only
      const page = await pdfDoc.getPage(1);
      const baseViewport = page.getViewport({ scale: 1.0 });

      // Calculate scale for high-quality rendering
      // Use device pixel ratio for sharp rendering on high-DPI screens
      const devicePixelRatio = window.devicePixelRatio || 1;
      const scale = (width / baseViewport.width) * devicePixelRatio;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) throw new Error('Canvas context not available');

      // Set actual canvas size for high-quality rendering
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      // Set display size (CSS pixels)
      const displayWidth = width;
      const displayHeight = (viewport.height / viewport.width) * width;
      setDimensions({ width: displayWidth, height: displayHeight });

      // Render with high quality settings
      await page.render({
        canvasContext: context,
        viewport,
        intent: 'display',
      }).promise;

      setLoading(false);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('PDF preview error:', err);
      setError(true);
      setLoading(false);
    }
  }, [pdfUrl, width]);

  useEffect(() => {
    renderFirstPage();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [renderFirstPage]);

  if (error) {
    return (
      <div 
        className={`flex flex-col items-center justify-center bg-muted ${className}`}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <FileText className="h-12 w-12 text-muted-foreground mb-2" />
        <span className="text-xs text-muted-foreground">PDF Document</span>
      </div>
    );
  }

  return (
    <div 
      className={`relative overflow-hidden bg-muted ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-auto"
        style={{
          display: loading ? 'none' : 'block',
          width: dimensions.width || '100%',
          height: dimensions.height || 'auto',
          maxWidth: '100%',
        }}
      />
    </div>
  );
});

export default PDFPreview;
