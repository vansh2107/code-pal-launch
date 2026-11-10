import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  ShieldAlert,
  Download,
  FileText
} from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface DocumentViewerProps {
  fileUrl: string;
  fileName: string;
  open: boolean;
  onClose: () => void;
  isPdf?: boolean;
}

interface PDFPageData {
  pageNum: number;
  width: number;
  height: number;
}

/**
 * High-quality document viewer with native PDF rendering.
 * PDFs are rendered directly to canvas at high resolution - no iframe embed fallback.
 * Supports zoom, rotation, and multi-page navigation.
 */
export function DocumentViewer({ fileUrl, fileName, open, onClose, isPdf: isPdfProp }: DocumentViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const pdfDocRef = useRef<any>(null);
  const [pageData, setPageData] = useState<PDFPageData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNetworkBlocked, setIsNetworkBlocked] = useState(false);
  const [isPdf, setIsPdf] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Helper to detect adblocker/client network block or CORS failure
  const checkIsBlocked = (err: any) => {
    const msg = (err?.message || String(err) || "").toLowerCase();
    const name = (err?.name || "").toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("err_blocked_by_client") ||
      msg.includes("networkerror") ||
      msg.includes("blocked") ||
      msg.includes("cors") ||
      (name.includes("typeerror") && msg.includes("fetch"))
    );
  };

  // Robust document type detection: distinguish PDF from images
  const detectPdf = useCallback(() => {
    if (typeof isPdfProp === 'boolean') return isPdfProp;
    const cleanUrl = (fileUrl?.split('?')[0] || '').toLowerCase();
    const cleanName = (fileName || '').toLowerCase();

    // Explicit image extensions are never PDFs
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp', '.heic'];
    if (imageExtensions.some((ext) => cleanName.endsWith(ext) || cleanUrl.endsWith(ext))) {
      return false;
    }

    return cleanName.endsWith('.pdf') || cleanUrl.endsWith('.pdf') || fileUrl?.toLowerCase().includes('.pdf');
  }, [fileUrl, fileName, isPdfProp]);

  // Load document when dialog opens
  useEffect(() => {
    if (open && fileUrl) {
      const isPdfFile = detectPdf();
      setIsPdf(isPdfFile);
      setCurrentPage(0);
      setRotation(0);
      setScale(1);
      setError(null);
      setIsNetworkBlocked(false);

      if (isPdfFile) {
        loadPDF();
      } else {
        loadImage();
      }
    }

    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [open, fileUrl, detectPdf]);

  // Render current page when it changes
  useEffect(() => {
    if (isPdf && (pdfDoc || pdfDocRef.current) && pageData.length > 0) {
      renderPage(currentPage + 1);
    }
  }, [currentPage, pdfDoc, scale, rotation, isPdf, pageData.length]);

  const loadImage = () => {
    setError(null);
    setIsNetworkBlocked(false);
    // Display images directly via browser native <img> tag without in-memory fetch()
    setImageUrl(fileUrl);
    setLoading(true);
  };

  const handleImageLoad = () => {
    setLoading(false);
  };

  const handleImageError = () => {
    setLoading(false);
    setError("Failed to load document image. Please check your network connection or disable ad-blockers for this site.");
  };

  const loadPDF = async () => {
    setLoading(true);
    setError(null);
    setIsNetworkBlocked(false);
    try {
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl as unknown as string;

      let response: Response;
      try {
        response = await fetch(fileUrl);
      } catch (fetchErr: any) {
        console.warn('PDF fetch failed / blocked (CORS or ad-blocker):', fetchErr);
        setIsNetworkBlocked(true);
        setError("Unable to render PDF preview inside the app. This is typically caused by storage CORS restrictions or content blocking.");
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to download PDF (HTTP ${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();

      let pdf: any;
      try {
        pdf = await getDocument({ data: arrayBuffer }).promise;
      } catch (wErr) {
        console.warn('PDF worker failed, retrying without worker...', wErr);
        pdf = await (getDocument as any)({ data: arrayBuffer, disableWorker: true }).promise;
      }

      pdfDocRef.current = pdf;
      setPdfDoc(pdf);

      // Get page dimensions for all pages
      const pages: PDFPageData[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        pages.push({
          pageNum: i,
          width: viewport.width,
          height: viewport.height,
        });
      }
      setPageData(pages);
      
      // Render first page immediately with synchronously available pdf instance
      await renderPage(1, pdf);
    } catch (err: any) {
      console.error('Error rendering PDF:', err);
      if (checkIsBlocked(err)) {
        setIsNetworkBlocked(true);
      }
      setError("Failed to render PDF preview. You can open or download the original file directly.");
    } finally {
      setLoading(false);
    }
  };

  const renderPage = async (pageNum: number, activePdfDoc?: any) => {
    const doc = activePdfDoc || pdfDocRef.current || pdfDoc;
    if (!doc || !canvasRef.current) return;

    setPageLoading(true);

    // Cancel any ongoing render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    try {
      const page = await doc.getPage(pageNum);
      
      // Calculate optimal scale based on container and device
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth * 0.9;
      const containerHeight = containerRef.current?.clientHeight || window.innerHeight * 0.7;
      
      const baseViewport = page.getViewport({ scale: 1, rotation });
      
      // Calculate scale to fit container while respecting user zoom
      const scaleX = containerWidth / baseViewport.width;
      const scaleY = containerHeight / baseViewport.height;
      const fitScale = Math.min(scaleX, scaleY, 2); // Cap at 2x for initial fit
      
      // Apply device pixel ratio for sharp rendering on high-DPI screens
      const devicePixelRatio = window.devicePixelRatio || 1;
      const renderScale = fitScale * scale * devicePixelRatio;
      
      const viewport = page.getViewport({ scale: renderScale, rotation });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) return;

      // Set actual canvas size (rendering resolution)
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      // Set display size (CSS pixels) - this is what the user sees
      canvas.style.width = `${Math.floor(viewport.width / devicePixelRatio)}px`;
      canvas.style.height = `${Math.floor(viewport.height / devicePixelRatio)}px`;

      // Clear canvas
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Render with high-quality settings
      const renderTask = page.render({
        canvasContext: context,
        viewport,
        intent: 'display',
      });

      renderTaskRef.current = renderTask;
      await renderTask.promise;
      
    } catch (error: any) {
      if (error.name !== 'RenderingCancelledException') {
        console.error('Error rendering PDF page:', error);
      }
    } finally {
      setPageLoading(false);
    }
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(pageData.length - 1, prev + 1));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 4));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleResetZoom = () => {
    setScale(1);
  };

  const handleRetry = () => {
    setError(null);
    setIsNetworkBlocked(false);
    if (isPdf) {
      loadPDF();
    } else {
      loadImage();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-[95vw] sm:max-w-5xl h-[90vh] p-0 flex flex-col" 
        aria-describedby="document-viewer-description"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b shrink-0 bg-background">
          <DialogTitle className="font-semibold truncate flex-1 text-sm sm:text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{fileName}</span>
          </DialogTitle>
          <div className="flex items-center gap-1 shrink-0">
            {fileUrl && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  title="Open original file"
                  className="h-8 w-8"
                >
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  title="Download document"
                  className="h-8 w-8"
                >
                  <a href={fileUrl} download={fileName} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <DialogDescription className="sr-only" id="document-viewer-description">
          Document viewer for {fileName}. {pageData.length > 1 ? `${pageData.length} pages` : '1 page'}
        </DialogDescription>

        {/* Viewer */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-auto bg-muted relative"
        >
          {/* Error / Fallback Card (Replaces broken <iframe> fallback) */}
          {error && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-background/95 gap-3 text-center">
              {isNetworkBlocked ? (
                <ShieldAlert className="h-12 w-12 text-amber-500" />
              ) : (
                <AlertCircle className="h-10 w-10 text-destructive" />
              )}
              <h3 className="font-semibold text-base text-foreground">
                {isNetworkBlocked ? "Browser Restricted In-App Preview" : "Unable to Display Document"}
              </h3>
              <p className="text-sm font-medium text-muted-foreground max-w-md">{error}</p>
              {isNetworkBlocked && (
                <p className="text-xs text-muted-foreground max-w-md">
                  Modern browsers and extensions restrict nested file previews. You can view or download the original file safely in a new tab.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={handleRetry} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Preview
                </Button>
                {fileUrl && (
                  <>
                    <Button variant="default" size="sm" asChild className="gap-1.5">
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Original Document
                      </a>
                    </Button>
                    <Button variant="secondary" size="sm" asChild className="gap-1.5">
                      <a href={fileUrl} download={fileName} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5" />
                        Download Document
                      </a>
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Loading Overlay */}
          {(loading || pageLoading) && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-xs z-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {loading ? "Loading document..." : "Rendering page..."}
              </p>
            </div>
          )}

          {/* Canvas for PDF mode */}
          {isPdf ? (
            <div className="min-h-full flex items-center justify-center p-4">
              <canvas
                ref={canvasRef}
                className="shadow-2xl rounded-lg max-w-full"
                style={{
                  display: error ? 'none' : 'block',
                  backgroundColor: 'white',
                }}
              />
            </div>
          ) : imageUrl ? (
            /* Image Viewer with zoom/pan */
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={4}
              centerOnInit
              wheel={{ step: 0.1 }}
              doubleClick={{ mode: "toggle", step: 0.7 }}
              pinch={{ step: 5 }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <TransformComponent
                    wrapperClass="w-full h-full"
                    contentClass="w-full h-full flex items-center justify-center"
                  >
                    <div className="w-full h-full flex items-center justify-center p-4">
                      <img
                        src={imageUrl}
                        alt={fileName}
                        className="max-w-full max-h-full rounded-lg shadow-2xl"
                        style={{
                          transform: `rotate(${rotation}deg)`,
                          transition: 'transform 0.3s ease-in-out',
                        }}
                        onLoad={handleImageLoad}
                        onError={handleImageError}
                      />
                    </div>
                  </TransformComponent>

                  {/* Floating controls for images */}
                  <div className="absolute bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/95 backdrop-blur-sm border rounded-lg p-2 shadow-lg z-10">
                    <Button variant="ghost" size="icon" onClick={() => zoomOut()} className="h-8 w-8">
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => resetTransform()} className="h-8 w-8">
                      <span className="text-xs font-medium">Reset</span>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => zoomIn()} className="h-8 w-8">
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <div className="w-px h-6 bg-border mx-1" />
                    <Button variant="ghost" size="icon" onClick={handleRotate} className="h-8 w-8">
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </TransformWrapper>
          ) : !loading && !error ? (
            <div className="flex items-center justify-center h-full p-4">
              <p className="text-sm text-muted-foreground">Failed to load document</p>
            </div>
          ) : null}
        </div>

        {/* PDF Controls */}
        {isPdf && !loading && !error && (
          <div className="flex items-center justify-center gap-2 p-3 sm:p-4 border-t bg-background shrink-0 flex-wrap">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-8 w-8">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium w-12 text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-8 w-8">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleResetZoom} className="h-8 w-8">
                <span className="text-xs">Reset</span>
              </Button>
            </div>

            <div className="w-px h-6 bg-border mx-2" />

            {/* Rotation */}
            <Button variant="ghost" size="icon" onClick={handleRotate} className="h-8 w-8">
              <RotateCw className="h-4 w-4" />
            </Button>

            {/* Page Navigation */}
            {pageData.length > 1 && (
              <>
                <div className="w-px h-6 bg-border mx-2" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePrevPage}
                  disabled={currentPage === 0}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium px-2 min-w-[60px] text-center">
                  {currentPage + 1} / {pageData.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNextPage}
                  disabled={currentPage === pageData.length - 1}
                  className="h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
