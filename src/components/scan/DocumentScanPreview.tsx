import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check, RotateCcw, Palette, Image as ImageIcon } from "lucide-react";
import { scanDocument, applyFilterToImage, ScanFilter, ScanResult } from "@/utils/documentScanner";
import { cn } from "@/lib/utils";

interface DocumentScanPreviewProps {
  imageSource: string | File;
  onConfirm: (processedImage: string) => void;
  onRetake: () => void;
  className?: string;
}

const FILTER_OPTIONS: { value: ScanFilter; label: string; icon: string }[] = [
  { value: 'color', label: 'Color', icon: '🎨' },
  { value: 'grayscale', label: 'Gray', icon: '⬜' },
  { value: 'blackwhite', label: 'B&W', icon: '⬛' },
];

export function DocumentScanPreview({
  imageSource,
  onConfirm,
  onRetake,
  className,
}: DocumentScanPreviewProps) {
  const [processing, setProcessing] = useState(true);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [currentFilter, setCurrentFilter] = useState<ScanFilter>('color');
  const [displayImage, setDisplayImage] = useState<string>('');
  const [applyingFilter, setApplyingFilter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Process document on mount
  useEffect(() => {
    let mounted = true;
    
    const processDocument = async () => {
      setProcessing(true);
      setError(null);
      
      try {
        const result = await scanDocument(imageSource, {
          filter: 'color',
          enhanceContrast: true,
          sharpen: true,
          removeShadows: true,
          autoCrop: true,
        });
        
        if (mounted) {
          setScanResult(result);
          setDisplayImage(result.processedImage);
          setCurrentFilter('color');
        }
      } catch (err) {
        console.error('Document scan error:', err);
        if (mounted) {
          setError('Failed to process document. Please try again.');
        }
      } finally {
        if (mounted) {
          setProcessing(false);
        }
      }
    };
    
    processDocument();
    
    return () => {
      mounted = false;
    };
  }, [imageSource]);

  // Handle filter change
  const handleFilterChange = useCallback(async (filter: ScanFilter) => {
    if (!scanResult || filter === currentFilter || applyingFilter) return;
    
    setApplyingFilter(true);
    setCurrentFilter(filter);
    
    try {
      // Re-process from original with new filter
      const result = await scanDocument(scanResult.originalImage, {
        filter,
        enhanceContrast: true,
        sharpen: true,
        removeShadows: true,
        autoCrop: true,
      });
      
      setDisplayImage(result.processedImage);
      setScanResult(result);
    } catch (err) {
      console.error('Filter change error:', err);
    } finally {
      setApplyingFilter(false);
    }
  }, [scanResult, currentFilter, applyingFilter]);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (displayImage) {
      onConfirm(displayImage);
    }
  }, [displayImage, onConfirm]);

  if (error) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-4 space-y-4">
          <div className="text-center py-8">
            <p className="text-destructive mb-4">{error}</p>
            <Button variant="outline" onClick={onRetake}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 space-y-4">
        {/* Preview Image */}
        <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
          {processing ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Scanning document...</p>
              <p className="text-xs text-muted-foreground mt-1">Detecting edges & enhancing</p>
            </div>
          ) : displayImage ? (
            <>
              <img
                src={displayImage}
                alt="Scanned document preview"
                className="w-full h-full object-contain"
              />
              {applyingFilter && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Filter Options */}
        {!processing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Palette className="h-4 w-4" />
              <span>Filter</span>
            </div>
            <div className="flex gap-2">
              {FILTER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={currentFilter === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleFilterChange(option.value)}
                  disabled={applyingFilter}
                  className="flex-1"
                >
                  <span className="mr-1">{option.icon}</span>
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!processing && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onRetake}
              className="flex-1"
              disabled={applyingFilter}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Retake
            </Button>
            <Button
              onClick={handleConfirm}
              className="flex-1"
              disabled={applyingFilter || !displayImage}
            >
              <Check className="h-4 w-4 mr-2" />
              Use This Scan
            </Button>
          </div>
        )}

        {/* Scan Info */}
        {!processing && scanResult && (
          <div className="text-xs text-muted-foreground text-center space-y-1">
            <p>✓ Auto edge detection applied</p>
            <p>✓ Contrast enhanced & shadows removed</p>
            <p>✓ Image sharpened for readability</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
