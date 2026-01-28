import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Check, RotateCcw, Move } from "lucide-react";

interface CropPoint {
  x: number;
  y: number;
}

interface CropBounds {
  topLeft: CropPoint;
  topRight: CropPoint;
  bottomLeft: CropPoint;
  bottomRight: CropPoint;
}

interface ManualCropOverlayProps {
  imageSource: string;
  initialBounds?: CropBounds | null;
  onConfirm: (bounds: CropBounds) => void;
  onCancel: () => void;
}

export function ManualCropOverlay({
  imageSource,
  initialBounds,
  onConfirm,
  onCancel,
}: ManualCropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [activeCorner, setActiveCorner] = useState<string | null>(null);
  
  const [bounds, setBounds] = useState<CropBounds>({
    topLeft: { x: 0.1, y: 0.1 },
    topRight: { x: 0.9, y: 0.1 },
    bottomLeft: { x: 0.1, y: 0.9 },
    bottomRight: { x: 0.9, y: 0.9 },
  });

  // Initialize bounds from detection or defaults
  useEffect(() => {
    if (initialBounds && imageSize.width > 0) {
      // Convert pixel bounds to normalized (0-1)
      setBounds({
        topLeft: {
          x: initialBounds.topLeft.x / imageSize.width,
          y: initialBounds.topLeft.y / imageSize.height,
        },
        topRight: {
          x: initialBounds.topRight.x / imageSize.width,
          y: initialBounds.topRight.y / imageSize.height,
        },
        bottomLeft: {
          x: initialBounds.bottomLeft.x / imageSize.width,
          y: initialBounds.bottomLeft.y / imageSize.height,
        },
        bottomRight: {
          x: initialBounds.bottomRight.x / imageSize.width,
          y: initialBounds.bottomRight.y / imageSize.height,
        },
      });
    }
  }, [initialBounds, imageSize]);

  // Load image and calculate display size
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight - 60; // Account for buttons
        
        const scaleX = containerWidth / img.width;
        const scaleY = containerHeight / img.height;
        const newScale = Math.min(scaleX, scaleY, 1);
        
        setScale(newScale);
        setDisplaySize({
          width: img.width * newScale,
          height: img.height * newScale,
        });
      }
    };
    img.src = imageSource;
  }, [imageSource]);

  // Handle touch/mouse events
  const handlePointerDown = useCallback((corner: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCorner(corner);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!activeCorner || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = (rect.width - displaySize.width) / 2;
    const offsetY = (rect.height - 60 - displaySize.height) / 2;
    
    let x = (e.clientX - rect.left - offsetX) / displaySize.width;
    let y = (e.clientY - rect.top - offsetY) / displaySize.height;
    
    // Clamp to valid range
    x = Math.max(0.05, Math.min(0.95, x));
    y = Math.max(0.05, Math.min(0.95, y));
    
    setBounds(prev => ({
      ...prev,
      [activeCorner]: { x, y },
    }));
  }, [activeCorner, displaySize]);

  const handlePointerUp = useCallback(() => {
    setActiveCorner(null);
  }, []);

  const handleConfirm = () => {
    // Convert normalized bounds back to pixels
    const pixelBounds: CropBounds = {
      topLeft: {
        x: bounds.topLeft.x * imageSize.width,
        y: bounds.topLeft.y * imageSize.height,
      },
      topRight: {
        x: bounds.topRight.x * imageSize.width,
        y: bounds.topRight.y * imageSize.height,
      },
      bottomLeft: {
        x: bounds.bottomLeft.x * imageSize.width,
        y: bounds.bottomLeft.y * imageSize.height,
      },
      bottomRight: {
        x: bounds.bottomRight.x * imageSize.width,
        y: bounds.bottomRight.y * imageSize.height,
      },
    };
    onConfirm(pixelBounds);
  };

  const resetBounds = () => {
    setBounds({
      topLeft: { x: 0.1, y: 0.1 },
      topRight: { x: 0.9, y: 0.1 },
      bottomLeft: { x: 0.1, y: 0.9 },
      bottomRight: { x: 0.9, y: 0.9 },
    });
  };

  // SVG path for crop area
  const cropPath = `
    M ${bounds.topLeft.x * 100}% ${bounds.topLeft.y * 100}%
    L ${bounds.topRight.x * 100}% ${bounds.topRight.y * 100}%
    L ${bounds.bottomRight.x * 100}% ${bounds.bottomRight.y * 100}%
    L ${bounds.bottomLeft.x * 100}% ${bounds.bottomLeft.y * 100}%
    Z
  `;

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <span className="text-white text-sm flex items-center gap-2">
          <Move className="h-4 w-4" />
          Drag corners to adjust crop
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetBounds}
          className="text-white hover:bg-white/20"
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
      </div>

      {/* Image with crop overlay */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div
          className="relative"
          style={{
            width: displaySize.width,
            height: displaySize.height,
          }}
        >
          {/* Background image */}
          <img
            src={imageSource}
            alt="Document to crop"
            className="w-full h-full object-contain"
            draggable={false}
          />

          {/* Dark overlay outside crop area */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ touchAction: 'none' }}
          >
            {/* Dark mask */}
            <defs>
              <mask id="cropMask">
                <rect width="100%" height="100%" fill="white" />
                <path
                  d={`M ${bounds.topLeft.x * displaySize.width} ${bounds.topLeft.y * displaySize.height}
                     L ${bounds.topRight.x * displaySize.width} ${bounds.topRight.y * displaySize.height}
                     L ${bounds.bottomRight.x * displaySize.width} ${bounds.bottomRight.y * displaySize.height}
                     L ${bounds.bottomLeft.x * displaySize.width} ${bounds.bottomLeft.y * displaySize.height}
                     Z`}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.6)"
              mask="url(#cropMask)"
            />

            {/* Crop border */}
            <path
              d={`M ${bounds.topLeft.x * displaySize.width} ${bounds.topLeft.y * displaySize.height}
                 L ${bounds.topRight.x * displaySize.width} ${bounds.topRight.y * displaySize.height}
                 L ${bounds.bottomRight.x * displaySize.width} ${bounds.bottomRight.y * displaySize.height}
                 L ${bounds.bottomLeft.x * displaySize.width} ${bounds.bottomLeft.y * displaySize.height}
                 Z`}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
            />

            {/* Grid lines */}
            <line
              x1={(bounds.topLeft.x + (bounds.topRight.x - bounds.topLeft.x) / 3) * displaySize.width}
              y1={(bounds.topLeft.y + (bounds.bottomLeft.y - bounds.topLeft.y) / 3) * displaySize.height}
              x2={(bounds.bottomLeft.x + (bounds.bottomRight.x - bounds.bottomLeft.x) / 3) * displaySize.width}
              y2={(bounds.bottomLeft.y - (bounds.bottomLeft.y - bounds.topLeft.y) / 3) * displaySize.height}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />
          </svg>

          {/* Corner handles */}
          {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map((corner) => (
            <div
              key={corner}
              className={`absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 touch-none
                ${activeCorner === corner ? 'scale-125' : ''}`}
              style={{
                left: bounds[corner].x * displaySize.width,
                top: bounds[corner].y * displaySize.height,
              }}
              onPointerDown={handlePointerDown(corner)}
            >
              <div className="w-full h-full rounded-full bg-primary border-2 border-white shadow-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 p-4 bg-black/80">
        <Button
          variant="outline"
          onClick={onCancel}
          className="flex-1 bg-transparent border-white/30 text-white hover:bg-white/10"
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          className="flex-1"
        >
          <Check className="h-4 w-4 mr-2" />
          Apply Crop
        </Button>
      </div>
    </div>
  );
}
