import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check, RotateCcw, Palette, Crop } from "lucide-react";
import { scanDocument, detectCropBounds, ScanFilter, ScanResult, CropBounds } from "@/utils/documentScanner";
import { ManualCropOverlay } from "./ManualCropOverlay";
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
  const [showCropOverlay, setShowCropOverlay] = useState(false);
  const [cropBounds, setCropBounds] = useState<CropBounds | null>(null);
  const [processingTime, setProcessingTime] = useState<number>(0);
  
  const processedRef = useRef(false);

  // Process document on mount
  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;
    
    let mounted = true;
    
    const processDocument = async () => {
      setProcessing(true);
      setError(null);
      const startTime = performance.now();
      
      try {
        // Detect crop bounds first (for potential manual adjustment)
        const detectedBounds = await detectCropBounds(imageSource);
        if (mounted) {
          setCropBounds(detectedBounds);
        }
        
        // Process with optimized settings
        const result = await scanDocument(imageSource, {
          filter: 'color',
          enhanceContrast: true,
          sharpen: false, // Skip for speed
          removeShadows: true,
          autoCrop: true,
          maxWidth: 1200,
        });
        
        const endTime = performance.now();
        
        if (mounted) {
          setScanResult(result);
          setDisplayImage(result.processedImage);
          setCurrentFilter('color');
          setProcessingTime(Math.round(endTime - startTime));
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

  // Handle filter change - fast path
  const handleFilterChange = useCallback(async (filter: ScanFilter) => {
    if (!scanResult || filter === currentFilter || applyingFilter) return;
    
    setApplyingFilter(true);
    setCurrentFilter(filter);
    
    try {
      // Re-process from original with new filter
      const result = await scanDocument(scanResult.originalImage, {
        filter,
        enhanceContrast: true,
        sharpen: false,
        removeShadows: true,
        autoCrop: true,
        maxWidth: 1200,
        cropBounds: cropBounds || undefined,
      });
      
      setDisplayImage(result.processedImage);
      setScanResult(result);
    } catch (err) {
      console.error('Filter change error:', err);
    } finally {
      setApplyingFilter(false);
    }
  }, [scanResult, currentFilter, applyingFilter, cropBounds]);

  // Handle manual crop
  const handleCropConfirm = useCallback(async (newBounds: CropBounds) => {
    setShowCropOverlay(false);
    setCropBounds(newBounds);
    setApplyingFilter(true);
    
    try {
      if (!scanResult) return;
      
      const result = await scanDocument(scanResult.originalImage, {
        filter: currentFilter,
        enhanceContrast: true,
        sharpen: false,
        removeShadows: true,
        autoCrop: false,
        maxWidth: 1200,
        cropBounds: newBounds,
      });
      
      setDisplayImage(result.processedImage);
      setScanResult(result);
    } catch (err) {
      console.error('Crop error:', err);
    } finally {
      setApplyingFilter(false);
    }
  }, [scanResult, currentFilter]);

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
    <>
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-4 space-y-4">
          {/* Preview Image */}
          <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
            {processing ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Scanning document...</p>
                <p className="text-xs text-muted-foreground mt-1">Auto-detecting edges</p>
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

          {/* Filter and Crop Options */}
          {!processing && (
            <div className="space-y-3">
              {/* Filter selection */}
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <div className="flex gap-2 flex-1">
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

              {/* Manual crop button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCropOverlay(true)}
                disabled={applyingFilter || !scanResult}
                className="w-full"
              >
                <Crop className="h-4 w-4 mr-2" />
                Adjust Crop
              </Button>
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
              <p>✓ Contrast enhanced</p>
              {processingTime > 0 && (
                <p className="text-primary">Processed in {processingTime}ms</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Crop Overlay */}
      {showCropOverlay && scanResult && (
        <ManualCropOverlay
          imageSource={scanResult.originalImage}
          initialBounds={cropBounds}
          onConfirm={handleCropConfirm}
          onCancel={() => setShowCropOverlay(false)}
        />
      )}
    </>
  );
}
