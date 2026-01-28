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
  const [activeCorner, setActiveCorner] = useState<string | null>(null);
  
  // Normalized bounds (0-1)
  const [bounds, setBounds] = useState<CropBounds>({
    topLeft: { x: 0.08, y: 0.08 },
    topRight: { x: 0.92, y: 0.08 },
    bottomLeft: { x: 0.08, y: 0.92 },
    bottomRight: { x: 0.92, y: 0.92 },
  });

  // Initialize bounds from detection
  useEffect(() => {
    if (initialBounds && imageSize.width > 0) {
      setBounds({
        topLeft: {
          x: Math.max(0.02, Math.min(0.98, initialBounds.topLeft.x / imageSize.width)),
          y: Math.max(0.02, Math.min(0.98, initialBounds.topLeft.y / imageSize.height)),
        },
        topRight: {
          x: Math.max(0.02, Math.min(0.98, initialBounds.topRight.x / imageSize.width)),
          y: Math.max(0.02, Math.min(0.98, initialBounds.topRight.y / imageSize.height)),
        },
        bottomLeft: {
          x: Math.max(0.02, Math.min(0.98, initialBounds.bottomLeft.x / imageSize.width)),
          y: Math.max(0.02, Math.min(0.98, initialBounds.bottomLeft.y / imageSize.height)),
        },
        bottomRight: {
          x: Math.max(0.02, Math.min(0.98, initialBounds.bottomRight.x / imageSize.width)),
          y: Math.max(0.02, Math.min(0.98, initialBounds.bottomRight.y / imageSize.height)),
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
        const containerWidth = containerRef.current.clientWidth - 32; // Padding
        const containerHeight = containerRef.current.clientHeight - 120; // Buttons
        
        const scaleX = containerWidth / img.width;
        const scaleY = containerHeight / img.height;
        const scale = Math.min(scaleX, scaleY, 1);
        
        setDisplaySize({
          width: Math.round(img.width * scale),
          height: Math.round(img.height * scale),
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
    if (!activeCorner || !containerRef.current || displaySize.width === 0) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = (rect.width - displaySize.width) / 2;
    const offsetY = (rect.height - 120 - displaySize.height) / 2 + 60; // Account for header
    
    let x = (e.clientX - rect.left - offsetX) / displaySize.width;
    let y = (e.clientY - rect.top - offsetY) / displaySize.height;
    
    // Clamp to valid range
    x = Math.max(0.02, Math.min(0.98, x));
    y = Math.max(0.02, Math.min(0.98, y));
    
    setBounds(prev => ({
      ...prev,
      [activeCorner]: { x, y },
    }));
  }, [activeCorner, displaySize]);

  const handlePointerUp = useCallback(() => {
    setActiveCorner(null);
  }, []);

  const handleConfirm = () => {
    // Convert normalized bounds to pixels
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
      topLeft: { x: 0.08, y: 0.08 },
      topRight: { x: 0.92, y: 0.08 },
      bottomLeft: { x: 0.08, y: 0.92 },
      bottomRight: { x: 0.92, y: 0.92 },
    });
  };

  // Build SVG path for crop polygon
  const buildPath = () => {
    if (displaySize.width === 0) return '';
    return `
      M ${bounds.topLeft.x * displaySize.width} ${bounds.topLeft.y * displaySize.height}
      L ${bounds.topRight.x * displaySize.width} ${bounds.topRight.y * displaySize.height}
      L ${bounds.bottomRight.x * displaySize.width} ${bounds.bottomRight.y * displaySize.height}
      L ${bounds.bottomLeft.x * displaySize.width} ${bounds.bottomLeft.y * displaySize.height}
      Z
    `;
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex flex-col touch-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-white/10">
        <span className="text-white text-sm flex items-center gap-2">
          <Move className="h-4 w-4" />
          Drag corners to adjust
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
        {displaySize.width > 0 && (
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
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />

            {/* Overlay SVG */}
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ touchAction: 'none' }}
            >
              {/* Dark mask outside crop area */}
              <defs>
                <mask id="cropMask">
                  <rect width="100%" height="100%" fill="white" />
                  <path d={buildPath()} fill="black" />
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="rgba(0,0,0,0.7)"
                mask="url(#cropMask)"
              />

              {/* Crop border */}
              <path
                d={buildPath()}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
              />

              {/* Grid lines inside crop area */}
              {[1, 2].map(i => {
                const t = i / 3;
                const leftX = bounds.topLeft.x + t * (bounds.bottomLeft.x - bounds.topLeft.x);
                const leftY = bounds.topLeft.y + t * (bounds.bottomLeft.y - bounds.topLeft.y);
                const rightX = bounds.topRight.x + t * (bounds.bottomRight.x - bounds.topRight.x);
                const rightY = bounds.topRight.y + t * (bounds.bottomRight.y - bounds.topRight.y);
                
                return (
                  <line
                    key={`h${i}`}
                    x1={leftX * displaySize.width}
                    y1={leftY * displaySize.height}
                    x2={rightX * displaySize.width}
                    y2={rightY * displaySize.height}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1"
                  />
                );
              })}
              {[1, 2].map(i => {
                const t = i / 3;
                const topX = bounds.topLeft.x + t * (bounds.topRight.x - bounds.topLeft.x);
                const topY = bounds.topLeft.y + t * (bounds.topRight.y - bounds.topLeft.y);
                const bottomX = bounds.bottomLeft.x + t * (bounds.bottomRight.x - bounds.bottomLeft.x);
                const bottomY = bounds.bottomLeft.y + t * (bounds.bottomRight.y - bounds.bottomLeft.y);
                
                return (
                  <line
                    key={`v${i}`}
                    x1={topX * displaySize.width}
                    y1={topY * displaySize.height}
                    x2={bottomX * displaySize.width}
                    y2={bottomY * displaySize.height}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1"
                  />
                );
              })}
            </svg>

            {/* Corner handles */}
            {(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const).map((corner) => (
              <div
                key={corner}
                className={`absolute w-10 h-10 -translate-x-1/2 -translate-y-1/2 touch-none cursor-move
                  ${activeCorner === corner ? 'scale-110' : ''}`}
                style={{
                  left: bounds[corner].x * displaySize.width,
                  top: bounds[corner].y * displaySize.height,
                }}
                onPointerDown={handlePointerDown(corner)}
              >
                {/* Outer ring */}
                <div className="absolute inset-1 rounded-full border-2 border-white/50" />
                {/* Inner dot */}
                <div className="absolute inset-2 rounded-full bg-primary border-2 border-white shadow-lg" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 p-4 bg-black/90 border-t border-white/10">
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
