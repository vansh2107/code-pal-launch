import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

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
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (open && fileUrl) {
      loadDocument();
    }
  }, [open, fileUrl]);

  const loadDocument = async () => {
    setLoading(true);
    try {
      // Check if it's a PDF by file extension or trying to load it
      const isPdfFile = fileUrl.toLowerCase().endsWith('.pdf');
      setIsPdf(isPdfFile);

      if (isPdfFile) {
        await loadPDF();
      } else {
        // It's an image
        setPages([fileUrl]);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading document:', error);
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
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(pages.length - 1, prev + 1));
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(3, prev + 0.25));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.5, prev - 0.25));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0" aria-describedby="document-viewer-description">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 id="document-viewer-title" className="font-semibold truncate flex-1">{fileName}</h3>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p id="document-viewer-description" className="sr-only">
            Document viewer for {fileName}. {pages.length > 1 ? `${pages.length} pages` : '1 page'}
          </p>

          {/* Viewer */}
          <div className="flex-1 overflow-auto bg-muted p-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                <p className="text-sm text-muted-foreground">Loading document...</p>
              </div>
            ) : pages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Failed to load document</p>
              </div>
            ) : (
              <div className="flex items-center justify-center min-h-full p-4">
                <img
                  src={pages[currentPage]}
                  alt={`Page ${currentPage + 1} of ${pages.length}`}
                  className="max-w-full h-auto shadow-lg"
                  style={{ 
                    transform: `scale(${zoom})`, 
                    transformOrigin: 'center',
                    transition: 'transform 0.2s ease-in-out'
                  }}
                  onError={(e) => {
                    console.error('Failed to load page image:', e);
                  }}
                />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between p-4 border-t bg-background">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium w-16 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            {pages.length > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handlePrevPage}
                  disabled={currentPage === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">
                  Page {currentPage + 1} of {pages.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleNextPage}
                  disabled={currentPage === pages.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
