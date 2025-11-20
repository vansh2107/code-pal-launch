import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface DocumentViewerProps {
  fileUrl: string;
  fileName: string;
  open: boolean;
  onClose: () => void;
}

export function DocumentViewer({ fileUrl, fileName, open, onClose }: DocumentViewerProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPdf, setIsPdf] = useState(false);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (open && fileUrl) {
      loadDocument();
    }
  }, [open, fileUrl]);

  const loadDocument = async () => {
    setLoading(true);
    setRotation(0);
    try {
      // Detect PDF via filename or URL before query params
      const cleanUrl = (fileUrl?.split('?')[0] || '').toLowerCase();
      const isPdfFile = (fileName?.toLowerCase().endsWith('.pdf')) || cleanUrl.endsWith('.pdf');
      setIsPdf(isPdfFile);

      if (isPdfFile) {
        await loadPDF();
      } else {
        // It's an image - load and apply EXIF orientation
        await loadImageWithOrientation(fileUrl);
      }
    } catch (error) {
      console.error('Error loading document:', error);
      setLoading(false);
    }
  };

  const loadImageWithOrientation = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      
      // Create image bitmap which auto-corrects EXIF orientation
      const imageBitmap = await createImageBitmap(blob);
      
      // Convert to canvas to get corrected data URL
      const canvas = document.createElement('canvas');
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(imageBitmap, 0, 0);
        const correctedUrl = canvas.toDataURL('image/jpeg', 0.95);
        setPages([correctedUrl]);
      } else {
        // Fallback to original URL
        setPages([url]);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error processing image orientation:', error);
      // Fallback to original URL
      setPages([url]);
      setLoading(false);
    }
  };

  const loadPDF = async () => {
    try {
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl as unknown as string;
      
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      
      let pdfDoc: any;
      try {
        pdfDoc = await getDocument({ data: arrayBuffer }).promise;
      } catch (wErr) {
        console.warn('PDF worker failed, retrying without worker...', wErr);
        pdfDoc = await (getDocument as any)({ data: arrayBuffer, disableWorker: true }).promise;
      }

      const numPages = pdfDoc.numPages;
      const pageImages: string[] = [];

      // Render all pages
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        
        if (context) {
          await page.render({
            canvasContext: context,
            viewport,
          } as any).promise;
          
          const imageData = canvas.toDataURL('image/png');
          pageImages.push(imageData);
        }
      }

      setPages(pageImages);
      setCurrentPage(0);
      setLoading(false);
    } catch (error) {
      console.error('Error loading PDF:', error);
      setLoading(false);
    }
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(0, prev - 1));
    setRotation(0);
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(pages.length - 1, prev + 1));
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-[95vw] sm:max-w-4xl h-[90vh] p-0 flex flex-col" 
        aria-describedby="document-viewer-description"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b shrink-0 bg-background">
          <DialogTitle className="font-semibold truncate flex-1 text-sm sm:text-base text-[#000000]">
            {fileName}
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Document viewer for {fileName}. {pages.length > 1 ? `${pages.length} pages` : '1 page'}
        </DialogDescription>

        {/* Viewer */}
        <div className="flex-1 overflow-hidden bg-muted">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
              <p className="text-sm text-[#000000]">Loading document...</p>
            </div>
          ) : pages.length === 0 ? (
            <div className="flex items-center justify-center h-full p-4">
              <p className="text-sm text-[#000000]">Failed to load document</p>
            </div>
          ) : (
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
                  {/* Image Container */}
                  <TransformComponent
                    wrapperClass="w-full h-full"
                    contentClass="w-full h-full flex items-center justify-center"
                  >
                    <div 
                      className="w-full h-full flex items-center justify-center p-3 sm:p-4"
                      style={{
                        maxHeight: 'calc(90vh - 120px)',
                      }}
                    >
                      <img
                        src={pages[currentPage]}
                        alt={`Page ${currentPage + 1} of ${pages.length}`}
                        className="w-full h-auto rounded-xl shadow-2xl"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                          backgroundColor: '#000',
                          transform: `rotate(${rotation}deg)`,
                          transition: 'transform 0.3s ease-in-out',
                        }}
                        onError={(e) => {
                          console.error('Failed to load page image:', e);
                        }}
                      />
                    </div>
                  </TransformComponent>

                  {/* Floating Zoom Controls */}
                  <div className="absolute bottom-20 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/95 backdrop-blur-sm border rounded-lg p-2 shadow-lg z-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => zoomOut()}
                      className="h-8 w-8"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => resetTransform()}
                      className="h-8 w-8"
                    >
                      <span className="text-xs font-medium text-[#000000]">Reset</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => zoomIn()}
                      className="h-8 w-8"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <div className="w-px h-6 bg-border mx-1" />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRotate}
                      className="h-8 w-8"
                      title="Rotate 90°"
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </TransformWrapper>
          )}
        </div>

        {/* Page Navigation (if multi-page) */}
        {pages.length > 1 && (
          <div className="flex items-center justify-center gap-2 p-3 sm:p-4 border-t bg-background shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-[#000000] px-2">
              {currentPage + 1} / {pages.length}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextPage}
              disabled={currentPage === pages.length - 1}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
