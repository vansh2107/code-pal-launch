import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check, RotateCcw, Palette, Crop, AlertCircle } from "lucide-react";
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
  const [autoCropFailed, setAutoCropFailed] = useState(false);
  
  const processedRef = useRef(false);
  const originalImageRef = useRef<string>('');

  // Process document on mount
  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;
    
    let mounted = true;
    
    const processDocument = async () => {
      setProcessing(true);
      setError(null);
      setAutoCropFailed(false);
      const startTime = performance.now();
      
      try {
        // Store original for crop adjustment
        if (typeof imageSource === 'string') {
          originalImageRef.current = imageSource;
        }
        
        // Detect crop bounds first
        const detectedBounds = await detectCropBounds(imageSource);
        if (mounted) {
          setCropBounds(detectedBounds);
        }
        
        // Process with auto-crop and enhancement
        const result = await scanDocument(imageSource, {
          filter: 'color',
          enhanceContrast: true,
          sharpen: true,
          removeShadows: true,
          autoCrop: true,
          maxWidth: 1200,
        });
        
        const endTime = performance.now();
        
        if (mounted) {
          setScanResult(result);
          setDisplayImage(result.processedImage);
          originalImageRef.current = result.originalImage;
          setCurrentFilter('color');
          setProcessingTime(Math.round(endTime - startTime));
          
          // Check if auto-crop was applied
          if (!result.autoCropApplied) {
            setAutoCropFailed(true);
          }
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
      const result = await scanDocument(originalImageRef.current, {
        filter,
        enhanceContrast: true,
        sharpen: true,
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
    setAutoCropFailed(false);
    
    try {
      const result = await scanDocument(originalImageRef.current, {
        filter: currentFilter,
        enhanceContrast: true,
        sharpen: true,
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
  }, [currentFilter]);

  // Handle confirm - ONLY allows processed image
  const handleConfirm = useCallback(() => {
    if (displayImage && scanResult) {
      // Always save the processed image, never the raw one
      onConfirm(scanResult.processedImage);
    }
  }, [displayImage, scanResult, onConfirm]);

  if (error) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-4 space-y-4">
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
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
                <p className="text-sm font-medium text-foreground">Scanning document...</p>
                <p className="text-xs text-muted-foreground mt-1">Auto-detecting edges & enhancing</p>
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

          {/* Auto-crop warning */}
          {!processing && autoCropFailed && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Auto-crop couldn't detect document edges. Use "Adjust Crop" to manually select the document area.
              </p>
            </div>
          )}

          {/* Filter and Crop Options */}
          {!processing && (
            <div className="space-y-3">
              {/* Filter selection */}
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
                variant={autoCropFailed ? "default" : "outline"}
                size="sm"
                onClick={() => setShowCropOverlay(true)}
                disabled={applyingFilter || !scanResult}
                className="w-full"
              >
                <Crop className="h-4 w-4 mr-2" />
                {autoCropFailed ? "Select Document Area" : "Adjust Crop"}
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
              {scanResult.autoCropApplied && <p>✓ Auto-cropped & straightened</p>}
              <p>✓ Enhanced for readability</p>
              {processingTime > 0 && (
                <p className="text-primary font-medium">Processed in {processingTime}ms</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Crop Overlay */}
      {showCropOverlay && originalImageRef.current && (
        <ManualCropOverlay
          imageSource={originalImageRef.current}
          initialBounds={cropBounds}
          onConfirm={handleCropConfirm}
          onCancel={() => setShowCropOverlay(false)}
        />
      )}
    </>
  );
}
