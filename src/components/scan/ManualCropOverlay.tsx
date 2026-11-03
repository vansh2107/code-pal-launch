import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Check, RotateCcw, Move, AlertTriangle, Magnet } from "lucide-react";

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

const LOUPE_SIZE = 120;
const LOUPE_ZOOM = 2.2;
const SNAP_THRESHOLD_NORM = 0.025; // 2.5% magnetic snap radius

export function ManualCropOverlay({
  imageSource,
  initialBounds,
  onConfirm,
  onCancel,
}: ManualCropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageBoxRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [activeCorner, setActiveCorner] = useState<string | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [magneticSnapEnabled, setMagneticSnapEnabled] = useState(true);
  const [edgePoints, setEdgePoints] = useState<{ x: number; y: number }[]>([]);
  
  // Normalized bounds (0-1)
  const [bounds, setBounds] = useState<CropBounds>({
    topLeft: { x: 0.08, y: 0.08 },
    topRight: { x: 0.92, y: 0.08 },
    bottomLeft: { x: 0.08, y: 0.92 },
    bottomRight: { x: 0.92, y: 0.92 },
  });

  // Validate that the 4 corners form a strictly convex quadrilateral
  const isValidQuad = useMemo(() => {
    const pts = [bounds.topLeft, bounds.topRight, bounds.bottomRight, bounds.bottomLeft];
    let pos = 0;
    let neg = 0;
    for (let i = 0; i < 4; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % 4];
      const p3 = pts[(i + 2) % 4];
      const crossVal = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
      if (crossVal > 1e-4) pos++;
      else if (crossVal < -1e-4) neg++;
      else return false;
    }
    return pos === 4 || neg === 4;
  }, [bounds]);

  // Initialize bounds from detection
  useEffect(() => {
    if (initialBounds && imageSize.width > 0) {
      const initialNorm = {
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
      };
      setBounds(initialNorm);

      // Register initial corners as magnetic anchor points
      setEdgePoints([
        initialNorm.topLeft,
        initialNorm.topRight,
        initialNorm.bottomRight,
        initialNorm.bottomLeft,
      ]);
    }
  }, [initialBounds, imageSize]);

  // Load image and calculate display size
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth - 32; // Padding
        const containerHeight = containerRef.current.clientHeight - 130; // Buttons & header
        
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
    setPointerPos({ x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!activeCorner || !imageBoxRef.current || displaySize.width === 0) return;

    setPointerPos({ x: e.clientX, y: e.clientY });

    const rect = imageBoxRef.current.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;
    
    // Magnetic snapping: if near edge anchors or outer margins, attract corner
    if (magneticSnapEnabled && edgePoints.length > 0) {
      for (const p of edgePoints) {
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < SNAP_THRESHOLD_NORM) {
          x = p.x;
          y = p.y;
          break;
        }
      }
      // Also snap to document border margins if within threshold
      if (Math.abs(x - 0.05) < 0.015) x = 0.05;
      if (Math.abs(x - 0.95) < 0.015) x = 0.95;
      if (Math.abs(y - 0.05) < 0.015) y = 0.05;
      if (Math.abs(y - 0.95) < 0.015) y = 0.95;
    }

    // Clamp to valid range
    x = Math.max(0.02, Math.min(0.98, x));
    y = Math.max(0.02, Math.min(0.98, y));
    
    setBounds(prev => ({
      ...prev,
      [activeCorner]: { x, y },
    }));
  }, [activeCorner, displaySize, magneticSnapEnabled, edgePoints]);

  const handlePointerUp = useCallback(() => {
    setActiveCorner(null);
    setPointerPos(null);
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
    if (initialBounds && imageSize.width > 0) {
      setBounds({
        topLeft: {
          x: Math.max(0.02, Math.min(0.98, initialBounds.topLeft.x / imageSize.width)),
          y: Math.max(0.02, Math.min(0.98, initialBounds.topRight.x / imageSize.width) ? initialBounds.topLeft.x / imageSize.width : 0.08),
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
    } else {
      setBounds({
        topLeft: { x: 0.08, y: 0.08 },
        topRight: { x: 0.92, y: 0.08 },
        bottomLeft: { x: 0.08, y: 0.92 },
        bottomRight: { x: 0.92, y: 0.92 },
      });
    }
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

  // Calculate loupe position relative to screen: place loupe above corner, or below if too high
  const activeCoord = activeCorner ? (bounds as any)[activeCorner] : null;

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black flex flex-col touch-none select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm flex items-center gap-1.5">
            <Move className="h-4 w-4 text-primary" />
            Drag corners to adjust
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMagneticSnapEnabled(prev => !prev)}
            className={`h-7 px-2 text-xs gap-1 border ${
              magneticSnapEnabled
                ? 'bg-primary/20 text-primary border-primary/40'
                : 'text-white/60 border-white/20'
            }`}
            title="Toggle Magnetic Edge Snapping"
          >
            <Magnet className="h-3 w-3" />
            Snap {magneticSnapEnabled ? 'On' : 'Off'}
          </Button>
        </div>
        {!isValidQuad && (
          <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-950/60 px-2.5 py-1 rounded border border-red-800">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Corners cannot cross</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={resetBounds}
          className="text-white hover:bg-white/20 h-8"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Reset
        </Button>
      </div>

      {/* Image with crop overlay */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
        {displaySize.width > 0 && (
          <div
            className="relative"
            ref={imageBoxRef}
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
                fill="rgba(0,0,0,0.72)"
                mask="url(#cropMask)"
              />

              {/* Crop border */}
              <path
                d={buildPath()}
                fill="none"
                stroke={isValidQuad ? "hsl(var(--primary))" : "#ef4444"}
                strokeWidth="2.5"
                strokeLinejoin="round"
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
                className={`absolute w-12 h-12 -translate-x-1/2 -translate-y-1/2 touch-none cursor-move z-10 flex items-center justify-center
                  ${activeCorner === corner ? 'scale-125' : ''}`}
                style={{
                  left: bounds[corner].x * displaySize.width,
                  top: bounds[corner].y * displaySize.height,
                }}
                onPointerDown={handlePointerDown(corner)}
              >
                {/* Outer ring */}
                <div className="absolute inset-1 rounded-full border-2 border-white/80 shadow-md" />
                {/* Inner dot */}
                <div className="absolute inset-2.5 rounded-full bg-primary border-2 border-white shadow-lg" />
              </div>
            ))}

            {/* Magnifying Loupe for Active Corner */}
            {activeCorner && activeCoord && (
              <div
                className="absolute pointer-events-none rounded-full border-2 border-white shadow-2xl overflow-hidden z-30"
                style={{
                  width: LOUPE_SIZE,
                  height: LOUPE_SIZE,
                  left: Math.max(
                    0,
                    Math.min(
                      displaySize.width - LOUPE_SIZE,
                      activeCoord.x * displaySize.width - LOUPE_SIZE / 2
                    )
                  ),
                  top:
                    activeCoord.y * displaySize.height - LOUPE_SIZE - 20 > 0
                      ? activeCoord.y * displaySize.height - LOUPE_SIZE - 20
                      : activeCoord.y * displaySize.height + 30,
                  backgroundColor: '#000',
                }}
              >
                <div
                  className="w-full h-full relative"
                  style={{
                    transform: `scale(${LOUPE_ZOOM})`,
                    transformOrigin: `${activeCoord.x * 100}% ${activeCoord.y * 100}%`,
                  }}
                >
                  <img
                    src={imageSource}
                    alt="Zoom"
                    className="w-full h-full object-contain"
                  />
                </div>
                {/* Crosshairs */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-full h-[1px] bg-primary/80 shadow-xs" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="h-full w-[1px] bg-primary/80 shadow-xs" />
                </div>
                <div className="absolute inset-0 rounded-full border border-primary/50 pointer-events-none" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] bg-black/90 border-t border-white/10 shrink-0">
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
          disabled={!isValidQuad}
        >
          <Check className="h-4 w-4 mr-2" />
          Apply Crop
        </Button>
      </div>
    </div>
  );
}
