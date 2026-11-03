import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCw, Loader2 } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface DocumentViewerProps {
  fileUrl: string;
  fileName: string;
  open: boolean;
  onClose: () => void;
}

interface PDFPageData {
  pageNum: number;
  width: number;
  height: number;
}

/**
 * High-quality document viewer with native PDF rendering.
 * PDFs are rendered directly to canvas at high resolution - no JPEG conversion.
 * Supports zoom, rotation, and multi-page navigation.
 */
export function DocumentViewer({ fileUrl, fileName, open, onClose }: DocumentViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageData, setPageData] = useState<PDFPageData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [isPdf, setIsPdf] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1.5);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Detect if file is PDF
  const detectPdf = useCallback(() => {
    const cleanUrl = (fileUrl?.split('?')[0] || '').toLowerCase();
    return fileName?.toLowerCase().endsWith('.pdf') || cleanUrl.endsWith('.pdf');
  }, [fileUrl, fileName]);

  // Load document when dialog opens
  useEffect(() => {
    if (open && fileUrl) {
      const isPdfFile = detectPdf();
      setIsPdf(isPdfFile);
      setCurrentPage(0);
      setRotation(0);
      setScale(1.5);

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
    if (isPdf && pdfDoc && pageData.length > 0) {
      renderPage(currentPage + 1);
    }
  }, [currentPage, pdfDoc, scale, rotation]);

  const loadImage = async () => {
    setLoading(true);
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      
      // Use createImageBitmap for EXIF orientation correction
      const imageBitmap = await createImageBitmap(blob);
      
      const canvas = document.createElement('canvas');
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(imageBitmap, 0, 0);
        setImageUrl(canvas.toDataURL('image/jpeg', 0.95));
      } else {
        setImageUrl(fileUrl);
      }
    } catch (error) {
      console.error('Error loading image:', error);
      setImageUrl(fileUrl);
    } finally {
      setLoading(false);
    }
  };

  const loadPDF = async () => {
    setLoading(true);
    try {
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl as unknown as string;

      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();

      let pdf: any;
      try {
        pdf = await getDocument({ data: arrayBuffer }).promise;
      } catch (wErr) {
        console.warn('PDF worker failed, retrying without worker...', wErr);
        pdf = await (getDocument as any)({ data: arrayBuffer, disableWorker: true }).promise;
      }

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
      
      // Render first page
      await renderPage(1);
    } catch (error) {
      console.error('Error loading PDF:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderPage = async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    setPageLoading(true);

    // Cancel any ongoing render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    try {
      const page = await pdfDoc.getPage(pageNum);
      
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
    setScale(1.5);
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
          <DialogTitle className="font-semibold truncate flex-1 text-sm sm:text-base">
            {fileName}
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <DialogDescription className="sr-only" id="document-viewer-description">
          Document viewer for {fileName}. {pageData.length > 1 ? `${pageData.length} pages` : '1 page'}
        </DialogDescription>

        {/* Viewer */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-auto bg-muted relative"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading document...</p>
            </div>
          ) : isPdf ? (
            /* PDF Canvas Viewer */
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="relative">
                {pageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  className="shadow-2xl rounded-lg max-w-full"
                  style={{
                    display: 'block',
                    backgroundColor: 'white',
                  }}
                />
              </div>
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
          ) : (
            <div className="flex items-center justify-center h-full p-4">
              <p className="text-sm text-muted-foreground">Failed to load document</p>
            </div>
          )}
        </div>

        {/* PDF Controls */}
        {isPdf && !loading && (
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
