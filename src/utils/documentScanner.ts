/**
 * Document Scanner Utility - CamScanner-style processing
 * Fast auto-crop with improved edge detection, perspective correction, and enhancement
 */

import {
  detectDocumentCandidates,
  perspectiveWarp,
  validateCrop,
  type DocumentCandidate,
} from './documentDetection';

export type ScanFilter = 'color' | 'grayscale' | 'blackwhite';

export interface ScanResult {
  processedImage: string;
  originalImage: string;
  filter: ScanFilter;
  cropBounds?: CropBounds;
  autoCropApplied: boolean;
  confidence: number; // 0-1 confidence score for auto-crop detection
}

export interface CropBounds {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

function scaleCropBounds(bounds: CropBounds, factor: number): CropBounds {
  return {
    topLeft: { x: bounds.topLeft.x * factor, y: bounds.topLeft.y * factor },
    topRight: { x: bounds.topRight.x * factor, y: bounds.topRight.y * factor },
    bottomLeft: { x: bounds.bottomLeft.x * factor, y: bounds.bottomLeft.y * factor },
    bottomRight: { x: bounds.bottomRight.x * factor, y: bounds.bottomRight.y * factor },
  };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function quadArea(b: CropBounds): number {
  const pts = [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft];
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    sum += a.x * c.y - c.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// Detection-phase downscale (for speed). Final output uses FULL resolution.
const DETECT_MAX_WIDTH = 1000;
// Output quality
const OUTPUT_JPEG_QUALITY = 0.95;
// Contour area thresholds (of detection canvas)
const MIN_CONTOUR_AREA_RATIO = 0.10;
const MAX_CONTOUR_AREA_RATIO = 0.92;
// Confidence threshold to auto-apply crop without manual intervention
const MIN_AUTOCROP_APPLY_CONFIDENCE = 0.55;

function isMeaningfulCrop(bounds: CropBounds, width: number, height: number): boolean {
  const area = quadArea(bounds);
  const ratio = area / (width * height);
  return ratio >= MIN_CONTOUR_AREA_RATIO && ratio <= MAX_CONTOUR_AREA_RATIO;
}

export interface ScanOptions {
  filter?: ScanFilter;
  enhanceContrast?: boolean;
  sharpen?: boolean;
  removeShadows?: boolean;
  autoCrop?: boolean;
  maxWidth?: number;
  cropBounds?: CropBounds;
}

/**
 * Main document scanning function
 * Detection runs on a small canvas for speed.
 * Final perspective-correct crop runs on the FULL resolution image for quality.
 */
export async function scanDocument(
  imageSource: string | File,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const {
    filter = 'color',
    enhanceContrast = true,
    sharpen = true,
    removeShadows = true,
    autoCrop = true,
    cropBounds,
  } = options;

  const img = await loadImage(imageSource);
  const originalImage = typeof imageSource === 'string' ? imageSource : await fileToDataURL(imageSource);

  const origW = img.width;
  const origH = img.height;

  // --- Detection phase (small canvas) ---
  const detectScale = origW > DETECT_MAX_WIDTH ? DETECT_MAX_WIDTH / origW : 1;
  const dw = Math.round(origW * detectScale);
  const dh = Math.round(origH * detectScale);

  let detectedBoundsOriginal: CropBounds | undefined;
  let autoCropApplied = false;
  let confidence = 0;
  let candidates: DocumentCandidate[] = [];

  if (autoCrop && !cropBounds) {
    const detectCanvas = document.createElement('canvas');
    const dctx = detectCanvas.getContext('2d', { willReadFrequently: true })!;
    detectCanvas.width = dw;
    detectCanvas.height = dh;
    dctx.drawImage(img, 0, 0, dw, dh);
    const detectData = dctx.getImageData(0, 0, dw, dh);

    try {
      candidates = detectDocumentCandidates(detectData, dw, dh, 5);
    } catch (e) {
      console.warn('Document detection failed:', e);
      candidates = [];
    }
  }

  // --- Output phase (full resolution) ---
  let outCanvas = document.createElement('canvas');
  let outCtx = outCanvas.getContext('2d', { willReadFrequently: true })!;
  outCanvas.width = origW;
  outCanvas.height = origH;
  outCtx.drawImage(img, 0, 0, origW, origH);
  const fullData = outCtx.getImageData(0, 0, origW, origH);

  let warped: { data: ImageData; width: number; height: number } | null = null;

  if (cropBounds) {
    // Manual / caller-supplied bounds are authoritative
    warped = perspectiveWarp(fullData, origW, origH, cropBounds);
    detectedBoundsOriginal = cropBounds;
    autoCropApplied = !!warped;
    confidence = 1.0;
  } else if (candidates.length) {
    for (const cand of candidates) {
      if (cand.confidence < MIN_AUTOCROP_APPLY_CONFIDENCE) continue;
      if (!isMeaningfulCrop(cand.corners, dw, dh)) continue;

      const scaled = scaleCropBounds(cand.corners, 1 / detectScale);
      const w = perspectiveWarp(fullData, origW, origH, scaled);
      if (!w) continue;

      const validation = validateCrop(w.data, w.width, w.height, origW, origH);
      if (!validation.valid) continue;

      warped = w;
      detectedBoundsOriginal = scaled;
      confidence = cand.confidence;
      autoCropApplied = true;
      break;
    }

    if (!autoCropApplied) {
      // Surface the best guess for the manual crop overlay, uncropped output
      const best = candidates[0];
      detectedBoundsOriginal = scaleCropBounds(best.corners, 1 / detectScale);
      confidence = best.confidence;
    }
  }

  if (warped) {
    outCanvas = document.createElement('canvas');
    outCanvas.width = warped.width;
    outCanvas.height = warped.height;
    outCtx = outCanvas.getContext('2d', { willReadFrequently: true })!;
    outCtx.putImageData(warped.data, 0, 0);
  }

  // Enhancement + filter (only if crop was applied)
  if (autoCropApplied) {
    let imageData = outCtx.getImageData(0, 0, outCanvas.width, outCanvas.height);

    if (removeShadows) {
      imageData = removeShadowsFast(imageData);
      outCtx.putImageData(imageData, 0, 0);
    }
    if (enhanceContrast) {
      imageData = enhanceContrastFast(imageData);
      outCtx.putImageData(imageData, 0, 0);
    }
    if (sharpen) {
      imageData = sharpenImageFast(imageData);
      outCtx.putImageData(imageData, 0, 0);
    }
    imageData = applyFilter(imageData, filter);
    outCtx.putImageData(imageData, 0, 0);
  }


  const processedImage = outCanvas.toDataURL('image/jpeg', OUTPUT_JPEG_QUALITY);

  return {
    processedImage,
    originalImage,
    filter,
    cropBounds: detectedBoundsOriginal,
    autoCropApplied,
    confidence,
  };
}

// ─── Enhancement filters ──────────────────────────────────────────────────────

function removeShadowsFast(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const blockSize = Math.max(24, Math.floor(Math.min(width, height) / 12));
  const targetBrightness = 225;

  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      const endY = Math.min(by + blockSize, height);
      const endX = Math.min(bx + blockSize, width);
      let sum = 0, cnt = 0;
      for (let y = by; y < endY; y += 3) {
        for (let x = bx; x < endX; x += 3) {
          const idx = (y * width + x) * 4;
          sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          cnt++;
        }
      }
      const avg = sum / cnt;
      if (avg < targetBrightness && avg > 40) {
        const factor = Math.min(1.35, targetBrightness / avg);
        for (let y = by; y < endY; y++) {
          for (let x = bx; x < endX; x++) {
            const idx = (y * width + x) * 4;
            result.data[idx] = Math.min(255, data[idx] * factor);
            result.data[idx + 1] = Math.min(255, data[idx + 1] * factor);
            result.data[idx + 2] = Math.min(255, data[idx + 2] * factor);
          }
        }
      }
    }
  }
  return result;
}

function enhanceContrastFast(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 20) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness < min) min = Math.floor(brightness);
    if (brightness > max) max = Math.ceil(brightness);
  }
  const range = max - min;
  if (range < 60) return imageData;
  const factor = 240 / range;
  const offset = -min * factor + 10;
  for (let i = 0; i < data.length; i += 4) {
    result.data[i] = Math.min(255, Math.max(0, data[i] * factor + offset));
    result.data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor + offset));
    result.data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor + offset));
  }
  return result;
}

function sharpenImageFast(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const amount = 0.4;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = data[idx + c];
        const blur = (
          data[((y - 1) * width + x) * 4 + c] +
          data[((y + 1) * width + x) * 4 + c] +
          data[(y * width + x - 1) * 4 + c] +
          data[(y * width + x + 1) * 4 + c]
        ) / 4;
        result.data[idx + c] = Math.max(0, Math.min(255, center + amount * (center - blur)));
      }
    }
  }
  return result;
}

function applyFilter(imageData: ImageData, filter: ScanFilter): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);

  switch (filter) {
    case 'grayscale':
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        result.data[i] = gray; result.data[i + 1] = gray; result.data[i + 2] = gray;
      }
      break;
    case 'blackwhite': {
      const blockSize = 15;
      const grayValues = new Uint8Array(width * height);
      for (let i = 0; i < data.length; i += 4) {
        grayValues[i >> 2] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          let sum = 0, cnt = 0;
          const sY = Math.max(0, y - blockSize);
          const eY = Math.min(height, y + blockSize);
          const sX = Math.max(0, x - blockSize);
          const eX = Math.min(width, x + blockSize);
          for (let sy = sY; sy < eY; sy += 3) {
            for (let sx = sX; sx < eX; sx += 3) { sum += grayValues[sy * width + sx]; cnt++; }
          }
          const threshold = (sum / cnt) - 10;
          const value = grayValues[y * width + x] > threshold ? 255 : 0;
          result.data[idx] = value; result.data[idx + 1] = value; result.data[idx + 2] = value;
        }
      }
      break;
    }
    case 'color':
    default:
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
        const sat = 1.15;
        result.data[i] = Math.min(255, Math.max(0, gray + (r - gray) * sat));
        result.data[i + 1] = Math.min(255, Math.max(0, gray + (g - gray) * sat));
        result.data[i + 2] = Math.min(255, Math.max(0, gray + (b - gray) * sat));
      }
      break;
  }
  return result;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

async function loadImage(source: string | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    if (typeof source === 'string') {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target?.result as string; };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(source);
    }
  });
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Detect crop bounds for manual adjustment UI
 */
export async function detectCropBounds(
  imageSource: string | File,
  maxWidth: number = 800
): Promise<CropBounds | null> {
  const img = await loadImage(imageSource);
  let width = img.width;
  let height = img.height;
  const scale = width > maxWidth ? maxWidth / width : 1;
  if (scale < 1) { width = Math.round(width * scale); height = Math.round(height * scale); }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  canvas.width = width; canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const result = detectDocumentContourImproved(imageData, width, height);
  if (!result?.bounds) return null;
  return scaleCropBounds(result.bounds, 1 / scale);
}

/**
 * Apply filter to already scanned image (fast path)
 */
export async function applyFilterToImage(
  imageSource: string,
  filter: ScanFilter
): Promise<string> {
  const img = await loadImage(imageSource);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  canvas.width = img.width; canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  imageData = applyFilter(imageData, filter);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', OUTPUT_JPEG_QUALITY);
}
