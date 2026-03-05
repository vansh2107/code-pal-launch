/**
 * Document Scanner Utility - CamScanner-style processing
 * Fast auto-crop with improved edge detection, perspective correction, and enhancement
 */

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
const CANNY_LOW_THRESHOLD = 50;
const CANNY_HIGH_THRESHOLD = 150;
// Confidence threshold to auto-apply crop without manual intervention
const MIN_AUTOCROP_APPLY_CONFIDENCE = 0.50;

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

  if (autoCrop && !cropBounds) {
    const detectCanvas = document.createElement('canvas');
    const dctx = detectCanvas.getContext('2d', { willReadFrequently: true })!;
    detectCanvas.width = dw;
    detectCanvas.height = dh;
    dctx.drawImage(img, 0, 0, dw, dh);
    const detectData = dctx.getImageData(0, 0, dw, dh);

    const detection = detectDocumentContourImproved(detectData, dw, dh);
    if (detection) {
      // Convert to original image coordinates
      detectedBoundsOriginal = scaleCropBounds(detection.bounds, 1 / detectScale);
      confidence = detection.confidence;

      const canApply =
        detection.confidence >= MIN_AUTOCROP_APPLY_CONFIDENCE &&
        isMeaningfulCrop(detection.bounds, dw, dh);

      if (canApply) {
        autoCropApplied = true;
      }
    }
  }

  // Decide which bounds to use for the final crop
  const finalBounds = cropBounds || (autoCropApplied ? detectedBoundsOriginal : undefined);

  if (cropBounds) {
    detectedBoundsOriginal = cropBounds;
    autoCropApplied = true;
    confidence = 1.0;
  }

  // --- Output phase (full resolution) ---
  let outCanvas = document.createElement('canvas');
  let outCtx = outCanvas.getContext('2d', { willReadFrequently: true })!;

  if (finalBounds && autoCropApplied) {
    // Perspective-correct crop at full resolution
    outCanvas.width = origW;
    outCanvas.height = origH;
    outCtx.drawImage(img, 0, 0, origW, origH);
    const fullData = outCtx.getImageData(0, 0, origW, origH);

    const corrected = applyPerspectiveCorrection(fullData, origW, origH, finalBounds);
    if (corrected) {
      outCanvas.width = corrected.width;
      outCanvas.height = corrected.height;
      outCtx = outCanvas.getContext('2d', { willReadFrequently: true })!;
      outCtx.putImageData(corrected.data, 0, 0);
    }
  } else {
    // No crop – just put the original on canvas
    outCanvas.width = origW;
    outCanvas.height = origH;
    outCtx.drawImage(img, 0, 0, origW, origH);
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

// ─── Detection pipeline ───────────────────────────────────────────────────────

function detectDocumentContourImproved(
  imageData: ImageData,
  width: number,
  height: number
): { bounds: CropBounds; confidence: number } | null {
  const { data } = imageData;

  // Grayscale
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }

  const smoothed = fastBoxBlur(gray, width, height);
  const edges = cannyEdgeDetection(smoothed, width, height);
  const dilatedEdges = dilateEdges(edges, width, height);

  const contour = findDocumentContour(dilatedEdges, width, height);
  if (contour) return contour;

  // Fallback: color contrast
  return detectByColorContrast(data, width, height);
}

// ─── Edge detection helpers ───────────────────────────────────────────────────

function fastBoxBlur(gray: Uint8Array, width: number, height: number): Uint8Array {
  const radius = 2;
  const tmp = new Uint16Array(width * height);
  const out = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    let sum = 0;
    const row = y * width;
    for (let x = -radius; x <= radius; x++) {
      sum += gray[row + Math.max(0, Math.min(width - 1, x))];
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum;
      const xRemove = Math.max(0, x - radius);
      const xAdd = Math.min(width - 1, x + radius + 1);
      sum += gray[row + xAdd] - gray[row + xRemove];
    }
  }

  const kernelSize = (radius * 2 + 1) * (radius * 2 + 1);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      sum += tmp[Math.max(0, Math.min(height - 1, y)) * width + x];
    }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = Math.round(sum / kernelSize);
      const yRemove = Math.max(0, y - radius);
      const yAdd = Math.min(height - 1, y + radius + 1);
      sum += tmp[yAdd * width + x] - tmp[yRemove * width + x];
    }
  }
  return out;
}

function cannyEdgeDetection(gray: Uint8Array, width: number, height: number): Uint8Array {
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const sobelX =
        -gray[(y - 1) * width + (x - 1)] + gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] + 2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] + gray[(y + 1) * width + (x + 1)];
      const sobelY =
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];
      gx[idx] = sobelX;
      gy[idx] = sobelY;
      magnitude[idx] = Math.sqrt(sobelX * sobelX + sobelY * sobelY);
      direction[idx] = Math.atan2(sobelY, sobelX);
    }
  }

  const nms = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const mag = magnitude[idx];
      const angleD = (direction[idx] * 180 / Math.PI + 180) % 180;
      let q: number, r: number;
      if (angleD < 22.5 || angleD >= 157.5) {
        q = magnitude[y * width + (x + 1)];
        r = magnitude[y * width + (x - 1)];
      } else if (angleD < 67.5) {
        q = magnitude[(y + 1) * width + (x - 1)];
        r = magnitude[(y - 1) * width + (x + 1)];
      } else if (angleD < 112.5) {
        q = magnitude[(y + 1) * width + x];
        r = magnitude[(y - 1) * width + x];
      } else {
        q = magnitude[(y - 1) * width + (x - 1)];
        r = magnitude[(y + 1) * width + (x + 1)];
      }
      if (mag >= q && mag >= r) nms[idx] = mag;
    }
  }

  const edges = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (nms[idx] >= CANNY_HIGH_THRESHOLD) {
        edges[idx] = 255;
      } else if (nms[idx] >= CANNY_LOW_THRESHOLD) {
        let hasStrong = false;
        for (let dy = -1; dy <= 1 && !hasStrong; dy++) {
          for (let dx = -1; dx <= 1 && !hasStrong; dx++) {
            if (nms[(y + dy) * width + (x + dx)] >= CANNY_HIGH_THRESHOLD) hasStrong = true;
          }
        }
        if (hasStrong) edges[idx] = 255;
      }
    }
  }
  return edges;
}

function dilateEdges(edges: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(width * height);
  const radius = 2;
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      let maxVal = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const val = edges[(y + dy) * width + (x + dx)];
          if (val > maxVal) maxVal = val;
        }
      }
      result[y * width + x] = maxVal;
    }
  }
  return result;
}

// ─── Document rectangle detection (projection-profile approach) ───────────────
// Instead of connected-component analysis (which fails because document edges
// are 4 separate disconnected lines), we use projection profiles:
// 1. Sum edge pixels per row → find strong horizontal edges (top/bottom)
// 2. Sum edge pixels per column → find strong vertical edges (left/right)
// 3. Form candidate rectangles from combinations of detected lines
// 4. Score each rectangle by how well edges run along all 4 sides

function findDocumentContour(
  edges: Uint8Array,
  width: number,
  height: number
): { bounds: CropBounds; confidence: number } | null {
  const imgArea = width * height;

  // --- Step 1: Build projection profiles ---
  // Horizontal profile: for each row, count edge pixels
  const hProfile = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (edges[row + x] > 0) count++;
    }
    hProfile[y] = count / width; // normalize to 0-1
  }

  // Vertical profile: for each column, count edge pixels
  const vProfile = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      if (edges[y * width + x] > 0) count++;
    }
    vProfile[x] = count / height;
  }

  // --- Step 2: Find peaks (strong edge lines) ---
  const minGap = Math.floor(Math.min(width, height) * 0.08);
  const borderSkip = Math.max(5, Math.floor(Math.min(width, height) * 0.02));

  const findPeaks = (profile: Float32Array, len: number, minSep: number, skip: number): number[] => {
    // Compute a dynamic threshold: top 15% of values
    const sorted = Array.from(profile).sort((a, b) => b - a);
    const threshold = Math.max(0.03, sorted[Math.floor(len * 0.15)] * 0.7);

    const peaks: { pos: number; val: number }[] = [];
    for (let i = skip; i < len - skip; i++) {
      const v = profile[i];
      if (v < threshold) continue;
      // Local maximum in a window
      let isMax = true;
      const halfWin = Math.max(3, Math.floor(minSep * 0.3));
      for (let j = Math.max(skip, i - halfWin); j <= Math.min(len - 1 - skip, i + halfWin); j++) {
        if (j !== i && profile[j] > v) { isMax = false; break; }
      }
      if (isMax) peaks.push({ pos: i, val: v });
    }

    // Sort by strength
    peaks.sort((a, b) => b.val - a.val);

    // Non-maximum suppression: keep only peaks that are far enough apart
    const kept: number[] = [];
    for (const p of peaks) {
      let tooClose = false;
      for (const k of kept) {
        if (Math.abs(p.pos - k) < minSep) { tooClose = true; break; }
      }
      if (!tooClose) kept.push(p.pos);
      if (kept.length >= 8) break; // enough candidates
    }
    return kept.sort((a, b) => a - b);
  };

  const hPeaks = findPeaks(hProfile, height, minGap, borderSkip); // candidate top/bottom rows
  const vPeaks = findPeaks(vProfile, width, minGap, borderSkip);  // candidate left/right cols

  if (hPeaks.length < 2 || vPeaks.length < 2) {
    return null; // Can't form a rectangle
  }

  // --- Step 3: Form candidate rectangles and score them ---
  let best: { bounds: CropBounds; confidence: number; score: number } | null = null;

  for (let ti = 0; ti < hPeaks.length - 1; ti++) {
    for (let bi = ti + 1; bi < hPeaks.length; bi++) {
      const top = hPeaks[ti];
      const bottom = hPeaks[bi];
      const rectH = bottom - top;
      if (rectH < height * 0.15) continue; // too thin

      for (let li = 0; li < vPeaks.length - 1; li++) {
        for (let ri = li + 1; ri < vPeaks.length; ri++) {
          const left = vPeaks[li];
          const right = vPeaks[ri];
          const rectW = right - left;
          if (rectW < width * 0.15) continue; // too narrow

          const rectArea = rectW * rectH;
          const areaRatio = rectArea / imgArea;
          if (areaRatio < MIN_CONTOUR_AREA_RATIO || areaRatio > MAX_CONTOUR_AREA_RATIO) continue;

          const aspect = rectW / rectH;
          if (aspect < 0.30 || aspect > 3.3) continue;

          // --- Step 4: Score this rectangle ---
          // Check edge presence along each side using a sampling band
          const band = 3;
          const step = Math.max(2, Math.floor(Math.min(rectW, rectH) / 50));

          const sampleSide = (
            x1: number, y1: number, x2: number, y2: number, samples: number
          ): number => {
            let hits = 0;
            for (let s = 0; s <= samples; s++) {
              const t = s / Math.max(1, samples);
              const sx = Math.round(x1 + t * (x2 - x1));
              const sy = Math.round(y1 + t * (y2 - y1));
              let found = false;
              for (let d = -band; d <= band && !found; d++) {
                // For horizontal lines, check vertically; for vertical, horizontally
                const isHorizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
                const cx = isHorizontal ? sx : sx + d;
                const cy = isHorizontal ? sy + d : sy;
                if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
                  if (edges[cy * width + cx] > 0) found = true;
                }
              }
              if (found) hits++;
            }
            return hits / Math.max(1, samples + 1);
          };

          const numSamples = Math.max(10, Math.floor(Math.max(rectW, rectH) / step));
          const topEdge = sampleSide(left, top, right, top, numSamples);
          const bottomEdge = sampleSide(left, bottom, right, bottom, numSamples);
          const leftEdge = sampleSide(left, top, left, bottom, numSamples);
          const rightEdge = sampleSide(right, top, right, bottom, numSamples);

          const avgEdge = (topEdge + bottomEdge + leftEdge + rightEdge) / 4;
          const strongSides = [topEdge, bottomEdge, leftEdge, rightEdge].filter(s => s >= 0.15).length;
          if (strongSides < 2) continue;

          // Center score
          const cx = (left + right) / 2;
          const cy = (top + bottom) / 2;
          const dx = cx - width / 2;
          const dy = cy - height / 2;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const diag = Math.sqrt(width * width + height * height);
          const centerScore = clamp01(1 - dist / (diag * 0.45));

          // Area score: prefer documents that fill a reasonable portion
          const mid = 0.45;
          const areaScore = clamp01(1 - Math.abs(areaRatio - mid) / 0.40);

          // Aspect score: prefer common document ratios
          const aspectTargets = [0.63, 0.707, 1.0, 1.414, 1.586];
          let bestAspectDiff = Infinity;
          for (const t of aspectTargets) {
            bestAspectDiff = Math.min(bestAspectDiff, Math.abs(aspect - t) / t);
          }
          const aspectScore = clamp01(1 - bestAspectDiff / 0.80);

          // Strong sides bonus
          const sidesBonus = clamp01((strongSides - 2) / 2);

          // Combined score
          const score = clamp01(
            avgEdge * 0.35 +
            centerScore * 0.25 +
            areaScore * 0.15 +
            aspectScore * 0.10 +
            sidesBonus * 0.15
          );

          const confidence = clamp01(score * 0.85 + (avgEdge > 0.3 ? 0.15 : avgEdge * 0.5));

          if (!best || score > best.score) {
            const bounds: CropBounds = {
              topLeft: { x: left, y: top },
              topRight: { x: right, y: top },
              bottomLeft: { x: left, y: bottom },
              bottomRight: { x: right, y: bottom },
            };
            best = { bounds, confidence, score };
          }
        }
      }
    }
  }

  if (!best) return null;
  if (best.score < 0.22) return null;
  return { bounds: best.bounds, confidence: best.confidence };
}

// ─── Color contrast fallback ──────────────────────────────────────────────────

function detectByColorContrast(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { bounds: CropBounds; confidence: number } | null {
  const sampleSize = Math.floor(Math.min(width, height) * 0.1);
  const cornerPositions = [
    [0, 0], [width - sampleSize, 0],
    [0, height - sampleSize], [width - sampleSize, height - sampleSize]
  ];

  const cornerSamples: number[][] = [];
  for (const [sx, sy] of cornerPositions) {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let y = sy; y < sy + sampleSize && y < height; y++) {
      for (let x = sx; x < sx + sampleSize && x < width; x++) {
        const idx = (y * width + x) * 4;
        rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2]; count++;
      }
    }
    if (count > 0) cornerSamples.push([rSum / count, gSum / count, bSum / count]);
  }

  const bgColor = cornerSamples.reduce(
    (acc, s) => [acc[0] + s[0] / cornerSamples.length, acc[1] + s[1] / cornerSamples.length, acc[2] + s[2] / cornerSamples.length],
    [0, 0, 0]
  );

  const colorThreshold = 30;
  let minX = width, maxX = 0, minY = height, maxY = 0;

  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const idx = (y * width + x) * 4;
      const colorDiff = Math.sqrt(
        Math.pow(data[idx] - bgColor[0], 2) +
        Math.pow(data[idx + 1] - bgColor[1], 2) +
        Math.pow(data[idx + 2] - bgColor[2], 2)
      );
      if (colorDiff > colorThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const regionW = maxX - minX;
  const regionH = maxY - minY;
  if (regionW < 40 || regionH < 40) return null;

  const areaRatio = (regionW * regionH) / (width * height);
  if (areaRatio < MIN_CONTOUR_AREA_RATIO || areaRatio > MAX_CONTOUR_AREA_RATIO) return null;

  const aspect = regionW / Math.max(1, regionH);
  if (aspect < 0.35 || aspect > 2.8) return null;

  // Center check
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dx = cx - width / 2;
  const dy = cy - height / 2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const diag = Math.sqrt(width * width + height * height);
  const centerScore = clamp01(1 - dist / (diag * 0.50));
  if (centerScore < 0.30) return null;

  // Border penalty (soft)
  const borderMargin = Math.max(6, Math.round(Math.min(width, height) * 0.015));
  let touchingSides = 0;
  if (minX <= borderMargin) touchingSides++;
  if (minY <= borderMargin) touchingSides++;
  if (maxX >= width - 1 - borderMargin) touchingSides++;
  if (maxY >= height - 1 - borderMargin) touchingSides++;
  if (touchingSides >= 4) return null; // full frame

  const padding = Math.floor(Math.min(width, height) * 0.01);
  minX = Math.max(0, minX - padding);
  maxX = Math.min(width - 1, maxX + padding);
  minY = Math.max(0, minY - padding);
  maxY = Math.min(height - 1, maxY + padding);

  const conf = clamp01(0.35 + centerScore * 0.15 - touchingSides * 0.08);

  return {
    bounds: {
      topLeft: { x: minX, y: minY },
      topRight: { x: maxX, y: minY },
      bottomLeft: { x: minX, y: maxY },
      bottomRight: { x: maxX, y: maxY },
    },
    confidence: conf,
  };
}

// ─── Perspective correction ───────────────────────────────────────────────────

function applyPerspectiveCorrection(
  srcData: ImageData,
  srcWidth: number,
  srcHeight: number,
  bounds: CropBounds
): { data: ImageData; width: number; height: number } | null {
  const src = bounds;

  const topWidth = Math.sqrt(
    Math.pow(src.topRight.x - src.topLeft.x, 2) + Math.pow(src.topRight.y - src.topLeft.y, 2)
  );
  const bottomWidth = Math.sqrt(
    Math.pow(src.bottomRight.x - src.bottomLeft.x, 2) + Math.pow(src.bottomRight.y - src.bottomLeft.y, 2)
  );
  const leftHeight = Math.sqrt(
    Math.pow(src.bottomLeft.x - src.topLeft.x, 2) + Math.pow(src.bottomLeft.y - src.topLeft.y, 2)
  );
  const rightHeight = Math.sqrt(
    Math.pow(src.bottomRight.x - src.topRight.x, 2) + Math.pow(src.bottomRight.y - src.topRight.y, 2)
  );

  // Use full detected size (no artificial cap) for maximum quality
  const dstWidth = Math.round(Math.max(topWidth, bottomWidth));
  const dstHeight = Math.round(Math.max(leftHeight, rightHeight));

  if (dstWidth < 100 || dstHeight < 100) return null;

  const dstData = new ImageData(dstWidth, dstHeight);

  for (let dy = 0; dy < dstHeight; dy++) {
    for (let dx = 0; dx < dstWidth; dx++) {
      const u = dx / dstWidth;
      const v = dy / dstHeight;

      const topX = src.topLeft.x + u * (src.topRight.x - src.topLeft.x);
      const topY = src.topLeft.y + u * (src.topRight.y - src.topLeft.y);
      const bottomX = src.bottomLeft.x + u * (src.bottomRight.x - src.bottomLeft.x);
      const bottomY = src.bottomLeft.y + u * (src.bottomRight.y - src.bottomLeft.y);

      const srcX = topX + v * (bottomX - topX);
      const srcY = topY + v * (bottomY - topY);

      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, srcWidth - 1);
      const y1 = Math.min(y0 + 1, srcHeight - 1);
      const fx = srcX - x0;
      const fy = srcY - y0;

      if (x0 >= 0 && x0 < srcWidth && y0 >= 0 && y0 < srcHeight) {
        const dstIdx = (dy * dstWidth + dx) * 4;
        for (let c = 0; c < 3; c++) {
          const v00 = srcData.data[(y0 * srcWidth + x0) * 4 + c];
          const v10 = srcData.data[(y0 * srcWidth + x1) * 4 + c];
          const v01 = srcData.data[(y1 * srcWidth + x0) * 4 + c];
          const v11 = srcData.data[(y1 * srcWidth + x1) * 4 + c];
          dstData.data[dstIdx + c] = Math.round(
            v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
          );
        }
        dstData.data[dstIdx + 3] = 255;
      }
    }
  }

  return { data: dstData, width: dstWidth, height: dstHeight };
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
