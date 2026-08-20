import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check, RotateCcw, Palette, Crop, AlertTriangle, ShieldCheck } from "lucide-react";
import { scanDocument, ScanFilter, ScanResult, CropBounds } from "@/utils/documentScanner";
import {
  detectDocumentQuad,
  centeredFallbackQuad,
  RELIABLE_SCORE,
} from "@/utils/documentEdgeDetection";
import { ManualCropOverlay } from "./ManualCropOverlay";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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

// Minimum confidence required for auto-crop to be accepted
const MIN_AUTO_CROP_CONFIDENCE = 0.75;

/**
 * Use AI vision (Gemini) to detect document boundaries.
 * Returns CropBounds in original image pixel coordinates, or null.
 */
async function detectBoundsWithAI(imageDataUrl: string): Promise<CropBounds | null> {
  try {
    // Get image dimensions
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = imageDataUrl;
    });

    // Downscale for the AI call to reduce payload size, but return coords in original space
    const MAX_AI_DIM = 1200;
    const scale = Math.min(1, MAX_AI_DIM / Math.max(img.width, img.height));
    const sendW = Math.round(img.width * scale);
    const sendH = Math.round(img.height * scale);

    let sendDataUrl = imageDataUrl;
    if (scale < 1) {
      const c = document.createElement('canvas');
      c.width = sendW;
      c.height = sendH;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, sendW, sendH);
      sendDataUrl = c.toDataURL('image/jpeg', 0.85);
    }

    const { data, error } = await supabase.functions.invoke('detect-document-bounds', {
      body: { imageBase64: sendDataUrl, width: sendW, height: sendH },
    });

    if (error || !data?.success || !data?.found) {
      return null;
    }

    const b = data.bounds;
    // Scale coordinates back to original image size
    const invScale = 1 / scale;
    return {
      topLeft: { x: b.topLeft.x * invScale, y: b.topLeft.y * invScale },
      topRight: { x: b.topRight.x * invScale, y: b.topRight.y * invScale },
      bottomLeft: { x: b.bottomLeft.x * invScale, y: b.bottomLeft.y * invScale },
      bottomRight: { x: b.bottomRight.x * invScale, y: b.bottomRight.y * invScale },
    };
  } catch (err) {
    console.warn('AI document detection failed, falling back to local:', err);
    return null;
  }
}

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
  
  // Crop validation state - MANDATORY auto-crop or manual crop
  const [cropApplied, setCropApplied] = useState(false);
  const [cropConfidence, setCropConfidence] = useState(0);
  const [requiresManualCrop, setRequiresManualCrop] = useState(false);
  
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
      setCropApplied(false);
      setRequiresManualCrop(false);
      const startTime = performance.now();
      
      try {
        // Store original for crop adjustment
        let originalDataUrl: string;
        if (typeof imageSource === 'string') {
          originalDataUrl = imageSource;
          originalImageRef.current = imageSource;
        } else {
          // Convert File to data URL
          originalDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(imageSource);
          });
          originalImageRef.current = originalDataUrl;
        }

        // === Run local detection first, Gemini as secondary ===

        // Get a small detection canvas
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = originalDataUrl;
        });
        const DETECT_MAX = 1000;
        const detectScale = Math.min(1, DETECT_MAX / Math.max(img.width, img.height));
        const dw = Math.round(img.width * detectScale);
        const dh = Math.round(img.height * detectScale);
        const detectCanvas = document.createElement('canvas');
        detectCanvas.width = dw;
        detectCanvas.height = dh;
        const dctx = detectCanvas.getContext('2d', { willReadFrequently: true });
        if (!dctx) throw new Error('Canvas 2D context unavailable for detection');
        dctx.drawImage(img, 0, 0, dw, dh);
        const detectData = dctx.getImageData(0, 0, dw, dh);

        const localResult = detectDocumentQuad(detectData.data, dw, dh);
        let usedBounds: CropBounds | null = null;
        let usedConfidence = 0;
        let detectionSource: 'local' | 'ai' | 'none' = 'none';

        if (localResult.quad && localResult.score >= RELIABLE_SCORE) {
          // Local detector is confident — skip Gemini entirely
          const [tl, tr, br, bl] = localResult.quad;
          const invDS = 1 / detectScale;
          usedBounds = {
            topLeft:     { x: tl.x * invDS, y: tl.y * invDS },
            topRight:    { x: tr.x * invDS, y: tr.y * invDS },
            bottomRight: { x: br.x * invDS, y: br.y * invDS },
            bottomLeft:  { x: bl.x * invDS, y: bl.y * invDS },
          };
          usedConfidence = localResult.score;
          detectionSource = 'local';
        } else {
          // Local uncertain — try Gemini as secondary
          try {
            const aiBounds = await detectBoundsWithAI(originalDataUrl);
            if (aiBounds) {
              usedBounds = aiBounds;
              usedConfidence = 0.95;
              detectionSource = 'ai';
            }
          } catch {
            // Gemini failed — continue
          }

          // If Gemini also failed but local had *some* quad, seed the manual overlay
          if (!usedBounds && localResult.quad) {
            const [tl, tr, br, bl] = localResult.quad;
            const invDS = 1 / detectScale;
            usedBounds = {
              topLeft:     { x: tl.x * invDS, y: tl.y * invDS },
              topRight:    { x: tr.x * invDS, y: tr.y * invDS },
              bottomRight: { x: br.x * invDS, y: br.y * invDS },
              bottomLeft:  { x: bl.x * invDS, y: bl.y * invDS },
            };
            usedConfidence = localResult.score;
            // detectionSource stays 'none' — below threshold, requires manual
          }
        }

        // If still no bounds at all, generate a centered fallback for the manual overlay
        if (!usedBounds) {
          const fb = centeredFallbackQuad(img.width, img.height);
          usedBounds = {
            topLeft:     { x: fb[0].x, y: fb[0].y },
            topRight:    { x: fb[1].x, y: fb[1].y },
            bottomRight: { x: fb[2].x, y: fb[2].y },
            bottomLeft:  { x: fb[3].x, y: fb[3].y },
          };
          usedConfidence = 0;
        }

        const autoAccepted = detectionSource !== 'none' && usedConfidence >= MIN_AUTO_CROP_CONFIDENCE;

        if (autoAccepted) {
          // Auto-crop with detected bounds
          const result = await scanDocument(imageSource, {
            filter: 'color',
            enhanceContrast: true,
            sharpen: true,
            removeShadows: true,
            autoCrop: false,
            maxWidth: 1200,
            cropBounds: usedBounds,
          });

          const endTime = performance.now();
          if (mounted) {
            setScanResult(result);
            setDisplayImage(result.processedImage);
            originalImageRef.current = result.originalImage;
            setCurrentFilter('color');
            setProcessingTime(Math.round(endTime - startTime));
            setCropConfidence(usedConfidence);
            setCropBounds(usedBounds);
            setCropApplied(true);
            setRequiresManualCrop(false);
          }
        } else {
          // Not confident enough — show original + require manual crop
          const result = await scanDocument(imageSource, {
            filter: 'color',
            enhanceContrast: true,
            sharpen: true,
            removeShadows: true,
            autoCrop: false,
            maxWidth: 1200,
          });

          const endTime = performance.now();
          if (mounted) {
            setScanResult(result);
            originalImageRef.current = result.originalImage;
            setDisplayImage(result.originalImage);
            setCurrentFilter('color');
            setProcessingTime(Math.round(endTime - startTime));
            setCropConfidence(usedConfidence);
            setCropBounds(usedBounds);
            setCropApplied(false);
            setRequiresManualCrop(true);
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error('[SCAN DEBUG] processing failed', {
          inputType: typeof imageSource === 'string' ? 'dataUrl/url' : 'File',
          inputMime: typeof imageSource === 'string' ? imageSource.slice(0, 30) : imageSource.type,
          inputName: typeof imageSource === 'string' ? undefined : imageSource.name,
          inputSize: typeof imageSource === 'string' ? imageSource.length : imageSource.size,
          platform: navigator.userAgent,
          error: err,
        });

        // Graceful degradation: never dead-end the user. Fall back to the raw
        // image with mandatory manual crop so the scan flow can still continue.
        if (mounted) {
          try {
            const fallback =
              typeof imageSource === 'string'
                ? imageSource
                : await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(imageSource);
                  });
            originalImageRef.current = fallback;
            setScanResult({
              processedImage: fallback,
              originalImage: fallback,
              filter: 'color',
              autoCropApplied: false,
              confidence: 0,
            });
            setDisplayImage(fallback);
            setCropApplied(false);
            setRequiresManualCrop(true);
            setProcessingTime(Math.round(performance.now() - startTime));
          } catch {
            setError(`Could not process this image. ${detail}`);
          }
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
    if (!cropApplied) return;
    
    setApplyingFilter(true);
    setCurrentFilter(filter);
    
    try {
      const result = await scanDocument(originalImageRef.current, {
        filter,
        enhanceContrast: true,
        sharpen: true,
        removeShadows: true,
        autoCrop: false, // lock to existing crop bounds to avoid drift
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
  }, [scanResult, currentFilter, applyingFilter, cropBounds, cropApplied]);

  // Handle manual crop - ALWAYS marks crop as applied
  const handleCropConfirm = useCallback(async (newBounds: CropBounds) => {
    setShowCropOverlay(false);
    setCropBounds(newBounds);
    setApplyingFilter(true);
    
    try {
      const result = await scanDocument(originalImageRef.current, {
        filter: currentFilter,
        enhanceContrast: true,
        sharpen: true,
        removeShadows: true,
        autoCrop: false, // Use manual bounds
        maxWidth: 1200,
        cropBounds: newBounds,
      });
      
      setDisplayImage(result.processedImage);
      setScanResult(result);
      
      // Manual crop is always accepted
      setCropApplied(true);
      setRequiresManualCrop(false);
      setCropConfidence(1.0);
    } catch (err) {
      console.error('Crop error:', err);
    } finally {
      setApplyingFilter(false);
    }
  }, [currentFilter]);

  // Handle confirm - allows if crop is applied or falls back to original
  const handleConfirm = useCallback(() => {
    if (displayImage && scanResult) {
      if (cropApplied) {
        onConfirm(scanResult.processedImage);
      } else {
        onConfirm(originalImageRef.current);
      }
    }
  }, [displayImage, scanResult, cropApplied, onConfirm]);

  // Can save if a valid image is displayed and not applying filter
  const canSave = !applyingFilter && !!displayImage;

  if (error) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardContent className="p-4 space-y-4">
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-3" />
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
                
                {/* Crop status badge */}
                <div className={cn(
                  "absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1",
                  cropApplied 
                    ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                    : "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
                )}>
                  {cropApplied ? (
                    <>
                      <ShieldCheck className="h-3 w-3" />
                      Cropped
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3 w-3" />
                      Not Cropped
                    </>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Crop suggestion when not auto-cropped */}
          {!processing && !cropApplied && (
            <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-slate-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Couldn't reliably detect document edges
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  We couldn't reliably detect the document edges. Please adjust the corners manually.
                </p>
              </div>
            </div>
          )}

          {/* Success message when crop is applied */}
          {!processing && cropApplied && !requiresManualCrop && (
            <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Document detected & cropped
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  Edges detected with {Math.round(cropConfidence * 100)}% confidence. You can adjust the crop if needed.
                </p>
              </div>
            </div>
          )}

          {/* Filter and Crop Options */}
          {!processing && (
            <div className="space-y-3">
              {/* Filter selection - only show if crop is applied */}
              {cropApplied && (
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
              )}

              {/* Manual crop button - highlighted when required */}
              <Button
                variant={requiresManualCrop ? "default" : "outline"}
                size="sm"
                onClick={() => setShowCropOverlay(true)}
                disabled={applyingFilter || !scanResult}
                className={cn(
                  "w-full",
                  requiresManualCrop && "bg-amber-500 hover:bg-amber-600 text-white"
                )}
              >
                <Crop className="h-4 w-4 mr-2" />
                {requiresManualCrop ? "Select Document Area (Required)" : "Adjust Crop"}
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
                disabled={!canSave}
              >
                <Check className="h-4 w-4 mr-2" />
                Use This Scan
              </Button>
            </div>
          )}

          {/* Cannot save warning */}
          {!processing && !cropApplied && (
            <p className="text-xs text-muted-foreground text-center">
              ℹ️ Original image will be used without cropping
            </p>
          )}

          {/* Scan Info */}
          {!processing && scanResult && cropApplied && (
            <div className="text-xs text-muted-foreground text-center space-y-1">
              <p>✓ Document cropped & straightened</p>
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
