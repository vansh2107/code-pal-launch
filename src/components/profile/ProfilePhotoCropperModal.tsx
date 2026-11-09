import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

interface ProfilePhotoCropperModalProps {
  source: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (croppedImage: Blob) => Promise<void> | void;
}

interface Point {
  x: number;
  y: number;
}

interface ImageDimensions {
  width: number;
  height: number;
}

const OUTPUT_SIZE = 512;

function clampPosition(
  position: Point,
  dimensions: ImageDimensions,
  viewportSize: number,
  rotation: number,
  zoom: number,
): Point {
  if (!dimensions.width || !dimensions.height || !viewportSize) return { x: 0, y: 0 };

  const rotatedWidth = rotation % 180 === 0 ? dimensions.width : dimensions.height;
  const rotatedHeight = rotation % 180 === 0 ? dimensions.height : dimensions.width;
  const scale = Math.max(viewportSize / rotatedWidth, viewportSize / rotatedHeight) * zoom;
  const maxX = Math.max(0, (rotatedWidth * scale - viewportSize) / 2);
  const maxY = Math.max(0, (rotatedHeight * scale - viewportSize) / 2);

  return {
    x: Math.min(maxX, Math.max(-maxX, position.x)),
    y: Math.min(maxY, Math.max(-maxY, position.y)),
  };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create the cropped photo."));
    }, "image/jpeg", 0.92);
  });
}

export function ProfilePhotoCropperModal({ source, onOpenChange, onSave }: ProfilePhotoCropperModalProps) {
  const cropAreaRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null);
  const [dimensions, setDimensions] = useState<ImageDimensions>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!source) return;
    setDimensions({ width: 0, height: 0 });
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setSaving(false);
    setImageError(false);
  }, [source]);

  useEffect(() => {
    const cropArea = cropAreaRef.current;
    if (!source || !cropArea) return;

    const measure = () => setViewportSize(cropArea.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(cropArea);
    return () => observer.disconnect();
  }, [source]);

  const rotatedDimensions = useMemo(() => {
    if (rotation % 180 === 0) return dimensions;
    return { width: dimensions.height, height: dimensions.width };
  }, [dimensions, rotation]);

  const baseScale = useMemo(() => {
    if (!viewportSize || !rotatedDimensions.width || !rotatedDimensions.height) return 0;
    return Math.max(viewportSize / rotatedDimensions.width, viewportSize / rotatedDimensions.height);
  }, [rotatedDimensions, viewportSize]);

  useEffect(() => {
    setPosition((current) => clampPosition(current, dimensions, viewportSize, rotation, zoom));
  }, [dimensions, rotation, viewportSize, zoom]);

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dimensions.width || saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: position,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clampPosition({
      x: drag.origin.x + event.clientX - drag.start.x,
      y: drag.origin.y + event.clientY - drag.start.y,
    }, dimensions, viewportSize, rotation, zoom));
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const handleSave = useCallback(async () => {
    const image = imageRef.current;
    if (!image || !dimensions.width || !viewportSize || saving) return;

    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo editing is not available on this device.");

      const outputScale = OUTPUT_SIZE / viewportSize;
      const imageScale = baseScale * zoom * outputScale;
      context.translate(OUTPUT_SIZE / 2 + position.x * outputScale, OUTPUT_SIZE / 2 + position.y * outputScale);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(
        image,
        (-dimensions.width * imageScale) / 2,
        (-dimensions.height * imageScale) / 2,
        dimensions.width * imageScale,
        dimensions.height * imageScale,
      );

      await onSave(await canvasToJpeg(canvas));
    } catch (error) {
      console.error("Could not crop profile photo:", error);
      setSaving(false);
    }
  }, [baseScale, dimensions, onSave, position, rotation, saving, viewportSize, zoom]);

  const imageWidth = dimensions.width * baseScale * zoom;
  const imageHeight = dimensions.height * baseScale * zoom;

  return (
    <Dialog open={Boolean(source)} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto p-5">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>Crop profile photo</DialogTitle>
          <DialogDescription>Drag to position your photo, then adjust the zoom.</DialogDescription>
        </DialogHeader>

        <div
          ref={cropAreaRef}
          role="img"
          aria-label="Circular profile photo crop area"
          className="relative mx-auto aspect-square w-full max-w-[320px] touch-none overflow-hidden rounded-full bg-muted/80 ring-4 ring-primary/80"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          {source && !imageError && (
            <img
              ref={imageRef}
              src={source}
              alt="Photo crop preview"
              draggable={false}
              onLoad={handleImageLoad}
              onError={() => setImageError(true)}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: imageWidth || undefined,
                height: imageHeight || undefined,
                transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) rotate(${rotation}deg)`,
                visibility: dimensions.width ? "visible" : "hidden",
              }}
            />
          )}
          {(!dimensions.width || imageError) && (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-muted-foreground">
              {imageError ? "This photo could not be opened." : "Preparing photo…"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Slider
            aria-label="Zoom profile photo"
            min={1}
            max={3}
            step={0.01}
            value={[zoom]}
            onValueChange={(value) => setZoom(value[0] ?? 1)}
            disabled={!dimensions.width || saving}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Rotate photo 90 degrees"
            title="Rotate photo"
            onClick={() => setRotation((current) => (current + 90) % 360)}
            disabled={!dimensions.width || saving}
          >
            <RotateCw aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!dimensions.width || saving || imageError}>
            {saving ? "Saving…" : "Save & Apply"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}