import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

interface PDFPageSelectorProps {
  file: File;
  onPageSelect: (pageImageBase64: string) => void;
  onCancel: () => void;
}

export function PDFPageSelector({ file, onPageSelect, onCancel }: PDFPageSelectorProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPDFPages();
  }, [file]);

  const loadPDFPages = async () => {
    try {
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl as unknown as string;
      const arrayBuffer = await file.arrayBuffer();
      let pdfDoc: any;
      
      try {
        pdfDoc = await getDocument({ data: arrayBuffer }).promise;
      } catch (wErr) {
        console.warn('PDF worker failed, retrying without worker...', wErr);
        pdfDoc = await (getDocument as any)({ data: arrayBuffer, disableWorker: true }).promise;
      }

      const numPages = pdfDoc.numPages;
      const pageImages: string[] = [];

      // Render all pages as high-quality thumbnails
      const devicePixelRatio = window.devicePixelRatio || 1;
      
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const baseViewport = page.getViewport({ scale: 1.0 });
        
        // Use higher scale for sharper thumbnails
        const thumbnailWidth = 300;
        const scale = (thumbnailWidth / baseViewport.width) * devicePixelRatio;
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        
        if (context) {
          await page.render({
            canvasContext: context,
            viewport,
            intent: 'display',
          } as any).promise;
          
          // Use PNG for thumbnails for better quality
          const imageData = canvas.toDataURL('image/png');
          pageImages.push(imageData);
        }
      }

      setPages(pageImages);
      setLoading(false);
    } catch (error) {
      console.error('Error loading PDF pages:', error);
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    try {
      // Render selected page at full quality
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl as unknown as string;
      const arrayBuffer = await file.arrayBuffer();
      let pdfDoc: any;
      
      try {
        pdfDoc = await getDocument({ data: arrayBuffer }).promise;
      } catch (wErr) {
        pdfDoc = await (getDocument as any)({ data: arrayBuffer, disableWorker: true }).promise;
      }

      const page = await pdfDoc.getPage(selectedPage + 1);
      const baseViewport = page.getViewport({ scale: 1.0 });
      
      // Render at high resolution for quality
      // Use device pixel ratio for sharp output
      const devicePixelRatio = window.devicePixelRatio || 1;
      const maxWidth = 2400; // Higher max width for better quality
      const scale = Math.min(3.0 * devicePixelRatio, Math.max(1.5, (maxWidth / baseViewport.width) * devicePixelRatio));
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      
      if (context) {
        await page.render({
          canvasContext: context,
          viewport,
          intent: 'display',
        } as any).promise;
        
        // Use PNG for lossless quality
        const imageData = canvas.toDataURL('image/png');
        onPageSelect(imageData);
      }
    } catch (error) {
      console.error('Error rendering selected page:', error);
    }
  };

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          <span className="ml-3 text-muted-foreground">Loading PDF pages...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Select Page to Scan</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 max-h-96 overflow-y-auto">
        {pages.map((pageImage, index) => (
          <button
            key={index}
            onClick={() => setSelectedPage(index)}
            className={`relative border-2 rounded-lg overflow-hidden hover:border-primary transition-colors ${
              selectedPage === index ? 'border-primary' : 'border-border'
            }`}
          >
            <img src={pageImage} alt={`Page ${index + 1}`} className="w-full" />
            {selectedPage === index && (
              <div className="absolute top-2 right-2 bg-primary rounded-full p-1">
                <CheckCircle2 className="w-5 h-5 text-primary-foreground" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-background/90 text-center py-1 text-sm font-medium">
              Page {index + 1}
            </div>
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <Button onClick={onCancel} variant="outline" className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleConfirm} className="flex-1">
          Scan Page {selectedPage + 1}
        </Button>
      </div>
    </Card>
  );
}
