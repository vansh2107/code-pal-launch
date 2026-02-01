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
  // Shoelace on TL->TR->BR->BL
  const pts = [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft];
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    sum += a.x * c.y - c.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function isMeaningfulCropScaled(bounds: CropBounds, width: number, height: number): boolean {
  const area = quadArea(bounds);
  const ratio = area / (width * height);
  // Reject near-full-frame (background still present) and tiny boxes.
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

// Constants for performance and detection
const MAX_PROCESS_WIDTH = 1200;
const EDGE_THRESHOLD = 30; // Lower threshold for better edge detection
// IMPORTANT: prevent the common false-positive where the "document" becomes the full frame/background.
// We only accept candidates that occupy a reasonable part of the frame.
const MIN_CONTOUR_AREA_RATIO = 0.20; // Minimum 20% of image area
const MAX_CONTOUR_AREA_RATIO = 0.90; // Maximum 90% of image area
const CANNY_LOW_THRESHOLD = 50;
const CANNY_HIGH_THRESHOLD = 150;

// Internal auto-apply threshold (conservative). If below this, we MUST fall back to manual crop.
const MIN_AUTOCROP_APPLY_CONFIDENCE = 0.58;

/**
 * Main document scanning function - Optimized for speed and accuracy
 * Target: Complete within 1-2 seconds
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
    maxWidth = MAX_PROCESS_WIDTH,
    cropBounds,
  } = options;

  // Load and resize image for faster processing
  const img = await loadImage(imageSource);
  const originalImage = typeof imageSource === 'string' ? imageSource : await fileToDataURL(imageSource);
  
  // Calculate scaled dimensions (max 1200px for speed)
  let width = img.width;
  let height = img.height;
  const scale = width > maxWidth ? maxWidth / width : 1;
  
  if (scale < 1) {
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  
  // Create processing canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  
  let imageData = ctx.getImageData(0, 0, width, height);
  let detectedBoundsOriginal: CropBounds | undefined;
  let autoCropApplied = false;
  let confidence = 0;
  
  // Step 1: Auto-crop with improved edge detection
  if (autoCrop && !cropBounds) {
    const detection = detectDocumentContourImproved(imageData, width, height);
    if (detection) {
      // detection.bounds are in SCALED coordinates (canvas size). Convert for UI/manual crop.
      detectedBoundsOriginal = scaleCropBounds(detection.bounds, 1 / scale);
      confidence = detection.confidence;

      const canApplyAutoCrop =
        detection.confidence >= MIN_AUTOCROP_APPLY_CONFIDENCE &&
        isMeaningfulCropScaled(detection.bounds, width, height);

      if (canApplyAutoCrop) {
        const corrected = applyPerspectiveCorrection(imageData, width, height, detection.bounds);
        if (corrected) {
          canvas.width = corrected.width;
          canvas.height = corrected.height;
          ctx.putImageData(corrected.data, 0, 0);
          imageData = corrected.data;
          autoCropApplied = true;
        }
      }
    }
  } else if (cropBounds) {
    // cropBounds provided by ManualCropOverlay are in ORIGINAL image coordinates.
    detectedBoundsOriginal = cropBounds;
    const boundsScaled = scaleCropBounds(cropBounds, scale);
    const corrected = applyPerspectiveCorrection(imageData, width, height, boundsScaled);
    if (corrected) {
      canvas.width = corrected.width;
      canvas.height = corrected.height;
      ctx.putImageData(corrected.data, 0, 0);
      imageData = corrected.data;
      autoCropApplied = true;
      confidence = 1.0;
    }
  }
  
  // IMPORTANT: Filters/enhancement MUST apply ONLY after a crop has been applied.
  if (autoCropApplied) {
    // Step 2: Shadow removal
    if (removeShadows) {
      imageData = removeShadowsFast(imageData);
      ctx.putImageData(imageData, 0, 0);
    }

    // Step 3: Contrast enhancement
    if (enhanceContrast) {
      imageData = enhanceContrastFast(imageData);
      ctx.putImageData(imageData, 0, 0);
    }

    // Step 4: Sharpening for text clarity
    if (sharpen) {
      imageData = sharpenImageFast(imageData);
      ctx.putImageData(imageData, 0, 0);
    }

    // Step 5: Apply color filter
    imageData = applyFilter(imageData, filter);
    ctx.putImageData(imageData, 0, 0);
  }
  
  // Convert to high quality JPEG
  const processedImage = canvas.toDataURL('image/jpeg', 0.92);
  
  return {
    processedImage,
    originalImage,
    filter,
    cropBounds: detectedBoundsOriginal,
    autoCropApplied,
    confidence,
  };
}

/**
 * Improved document contour detection using multi-stage approach
 */
function detectDocumentContourImproved(
  imageData: ImageData,
  width: number,
  height: number
): { bounds: CropBounds; confidence: number } | null {
  const { data } = imageData;
  
  // Stage 1: Convert to grayscale with luminance weighting
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Use standard luminance coefficients
    gray[j] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }
  
  // Stage 2: FAST blur (bilateral was too slow on mobile); good enough for edge stabilization.
  const smoothed = fastBoxBlur(gray, width, height);
  
  // Stage 3: Canny-like edge detection with hysteresis
  const edges = cannyEdgeDetection(smoothed, width, height);
  
  // Stage 4: Dilate edges to connect broken lines
  const dilatedEdges = dilateEdges(edges, width, height);
  
  // Stage 5: Find document contour using multiple methods
  const contour = findDocumentContour(dilatedEdges, width, height);
  
  if (!contour) {
    // Fallback: Use color-based segmentation
    return detectByColorContrast(data, width, height);
  }
  
  return contour;
}

/**
 * Fast separable box blur (radius=2)
 */
function fastBoxBlur(gray: Uint8Array, width: number, height: number): Uint8Array {
  const radius = 2;
  const tmp = new Uint16Array(width * height);
  const out = new Uint8Array(width * height);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const row = y * width;
    for (let x = -radius; x <= radius; x++) {
      const xx = Math.max(0, Math.min(width - 1, x));
      sum += gray[row + xx];
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum;
      const xRemove = Math.max(0, x - radius);
      const xAdd = Math.min(width - 1, x + radius + 1);
      sum += gray[row + xAdd] - gray[row + xRemove];
    }
  }

  // Vertical pass
  const kernelSize = (radius * 2 + 1) * (radius * 2 + 1);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      const yy = Math.max(0, Math.min(height - 1, y));
      sum += tmp[yy * width + x];
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

/**
 * Bilateral filter for edge-preserving smoothing
 */
function bilateralFilter(gray: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(width * height);
  const radius = 3;
  const sigmaSpace = 3;
  const sigmaColor = 30;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerIdx = y * width + x;
      const centerVal = gray[centerIdx];
      
      let weightSum = 0;
      let valueSum = 0;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          
          const neighborIdx = ny * width + nx;
          const neighborVal = gray[neighborIdx];
          
          // Spatial weight
          const spatialDist = Math.sqrt(dx * dx + dy * dy);
          const spatialWeight = Math.exp(-(spatialDist * spatialDist) / (2 * sigmaSpace * sigmaSpace));
          
          // Range weight (color similarity)
          const colorDist = Math.abs(centerVal - neighborVal);
          const colorWeight = Math.exp(-(colorDist * colorDist) / (2 * sigmaColor * sigmaColor));
          
          const weight = spatialWeight * colorWeight;
          weightSum += weight;
          valueSum += weight * neighborVal;
        }
      }
      
      result[centerIdx] = Math.round(valueSum / weightSum);
    }
  }
  
  return result;
}

/**
 * Canny edge detection with non-maximum suppression and hysteresis
 */
function cannyEdgeDetection(gray: Uint8Array, width: number, height: number): Uint8Array {
  // Compute gradients using Sobel
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Sobel X
      const sobelX = 
        -gray[(y - 1) * width + (x - 1)] + gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] + 2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] + gray[(y + 1) * width + (x + 1)];
      
      // Sobel Y
      const sobelY = 
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];
      
      gx[idx] = sobelX;
      gy[idx] = sobelY;
      magnitude[idx] = Math.sqrt(sobelX * sobelX + sobelY * sobelY);
      direction[idx] = Math.atan2(sobelY, sobelX);
    }
  }
  
  // Non-maximum suppression
  const nms = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const angle = direction[idx];
      const mag = magnitude[idx];
      
      // Quantize angle to 4 directions
      let q: number, r: number;
      const angleD = (angle * 180 / Math.PI + 180) % 180;
      
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
      
      if (mag >= q && mag >= r) {
        nms[idx] = mag;
      }
    }
  }
  
  // Double threshold and hysteresis
  const edges = new Uint8Array(width * height);
  const strong = CANNY_HIGH_THRESHOLD;
  const weak = CANNY_LOW_THRESHOLD;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (nms[idx] >= strong) {
        edges[idx] = 255;
      } else if (nms[idx] >= weak) {
        // Check if connected to strong edge
        let hasStrongNeighbor = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (nms[(y + dy) * width + (x + dx)] >= strong) {
              hasStrongNeighbor = true;
              break;
            }
          }
          if (hasStrongNeighbor) break;
        }
        if (hasStrongNeighbor) {
          edges[idx] = 255;
        }
      }
    }
  }
  
  return edges;
}

/**
 * Dilate edges to connect broken lines
 */
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

/**
 * Find document contour using line voting and corner detection
 */
function findDocumentContour(
  edges: Uint8Array,
  width: number,
  height: number
): { bounds: CropBounds; confidence: number } | null {
  // Connected-component detection on the dilated edge map.
  // CRITICAL: do NOT blindly pick the largest component (often the background/frame).
  // We only accept "document-like" rectangles:
  // - area 20%–90%
  // - NOT touching image borders
  // - reasonable aspect ratio
  // - strong edge presence along the bbox sides
  // - center-weighted

  const imgArea = width * height;
  const visited = new Uint8Array(imgArea);
  const stack = new Int32Array(imgArea); // worst-case, reused

  let best: { bounds: CropBounds; confidence: number; score: number } | null = null;

  const borderMargin = Math.max(10, Math.round(Math.min(width, height) * 0.02));

  const computeCenterScore = (minX: number, minY: number, maxX: number, maxY: number) => {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const dx = cx - width / 2;
    const dy = cy - height / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const diag = Math.sqrt(width * width + height * height);
    return clamp01(1 - dist / (diag * 0.55));
  };

  const computeAreaScore = (areaRatio: number) => {
    const mid = 0.55;
    const halfSpan = 0.35;
    return clamp01(1 - Math.abs(areaRatio - mid) / halfSpan);
  };

  const computeAspectScore = (aspect: number) => {
    const targets = [0.707, 1.414, 1.586];
    let bestRel = Infinity;
    for (const t of targets) {
      bestRel = Math.min(bestRel, Math.abs(aspect - t) / t);
    }
    return clamp01(1 - bestRel / 0.85);
  };

  const computeSideCoverage = (minX: number, minY: number, maxX: number, maxY: number) => {
    const band = 2;
    const bboxW = maxX - minX + 1;
    const bboxH = maxY - minY + 1;
    const step = Math.max(2, Math.floor(Math.min(bboxW, bboxH) / 70));

    const sampleTopBottom = (yBase: number) => {
      let hits = 0;
      let total = 0;
      for (let x = minX; x <= maxX; x += step) {
        total++;
        let ok = false;
        for (let dy = -band; dy <= band; dy++) {
          const y = yBase + dy;
          if (y < 0 || y >= height) continue;
          if (edges[y * width + x] > 0) {
            ok = true;
            break;
          }
        }
        if (ok) hits++;
      }
      return total ? hits / total : 0;
    };

    const sampleLeftRight = (xBase: number) => {
      let hits = 0;
      let total = 0;
      for (let y = minY; y <= maxY; y += step) {
        total++;
        let ok = false;
        for (let dx = -band; dx <= band; dx++) {
          const x = xBase + dx;
          if (x < 0 || x >= width) continue;
          if (edges[y * width + x] > 0) {
            ok = true;
            break;
          }
        }
        if (ok) hits++;
      }
      return total ? hits / total : 0;
    };

    const top = sampleTopBottom(minY);
    const bottom = sampleTopBottom(maxY);
    const left = sampleLeftRight(minX);
    const right = sampleLeftRight(maxX);
    const overall = (top + bottom + left + right) / 4;
    const strongSides = [top, bottom, left, right].filter((s) => s >= 0.18).length;
    return { top, bottom, left, right, overall, strongSides };
  };

  const neighbors = [
    -width - 1,
    -width,
    -width + 1,
    -1,
    1,
    width - 1,
    width,
    width + 1,
  ];

  for (let i = 0; i < imgArea; i++) {
    if (edges[i] === 0 || visited[i]) continue;

    // BFS/DFS over this component
    let sp = 0;
    stack[sp++] = i;
    visited[i] = 1;

    let count = 0;
    let minX = width,
      maxX = 0,
      minY = height,
      maxY = 0;

    // Extreme points for quad approximation
    let minSum = Infinity,
      maxSum = -Infinity,
      minDiff = Infinity,
      maxDiff = -Infinity;
    let tl = { x: 0, y: 0 },
      tr = { x: 0, y: 0 },
      bl = { x: 0, y: 0 },
      br = { x: 0, y: 0 };

    while (sp > 0) {
      const idx = stack[--sp];
      const y = Math.floor(idx / width);
      const x = idx - y * width;

      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const sum = x + y;
      const diff = x - y;
      if (sum < minSum) {
        minSum = sum;
        tl = { x, y };
      }
      if (sum > maxSum) {
        maxSum = sum;
        br = { x, y };
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        tr = { x, y };
      }
      if (diff < minDiff) {
        minDiff = diff;
        bl = { x, y };
      }

      for (let k = 0; k < neighbors.length; k++) {
        const n = idx + neighbors[k];
        if (n < 0 || n >= imgArea) continue;
        // Avoid row wrap
        const ny = Math.floor(n / width);
        const nx = n - ny * width;
        if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) continue;
        if (edges[n] === 0 || visited[n]) continue;
        visited[n] = 1;
        stack[sp++] = n;
      }
    }

    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    if (bboxW < 40 || bboxH < 40) continue;

    // Reject components that touch the image borders (common background/frame false-positive)
    if (
      minX <= borderMargin ||
      minY <= borderMargin ||
      maxX >= width - 1 - borderMargin ||
      maxY >= height - 1 - borderMargin
    ) {
      continue;
    }

    const bboxArea = bboxW * bboxH;
    const bboxAreaRatio = bboxArea / imgArea;
    if (bboxAreaRatio < MIN_CONTOUR_AREA_RATIO || bboxAreaRatio > MAX_CONTOUR_AREA_RATIO) continue;

    const aspect = bboxW / bboxH;
    if (aspect < 0.45 || aspect > 2.2) continue;

    // Reject very "busy" regions (bedsheet texture, floor patterns, etc.)
    const rawEdgeDensity = count / Math.max(1, bboxArea);
    if (rawEdgeDensity > 0.12) continue;

    const bounds: CropBounds = {
      topLeft: tl,
      topRight: tr,
      bottomLeft: bl,
      bottomRight: br,
    };

    const area = quadArea(bounds);
    const quadAreaRatio = area / imgArea;
    if (quadAreaRatio < MIN_CONTOUR_AREA_RATIO || quadAreaRatio > MAX_CONTOUR_AREA_RATIO) continue;
    const quadFill = clamp01(area / bboxArea);

    // Must behave like a rectangle border: edges should exist along 3-4 sides.
    const coverage = computeSideCoverage(minX, minY, maxX, maxY);
    if (coverage.overall < 0.20 || coverage.strongSides < 3) continue;

    const centerScore = computeCenterScore(minX, minY, maxX, maxY);
    const areaScore = computeAreaScore(bboxAreaRatio);
    const aspectScore = computeAspectScore(aspect);
    const edgeScore = clamp01(coverage.overall);

    // Final score: prioritize rectangle-like border edges + being centered.
    const score = clamp01(edgeScore * 0.40 + centerScore * 0.28 + areaScore * 0.22 + aspectScore * 0.10);

    // Confidence: conservative (used by scanDocument to decide auto-apply).
    const confidence = clamp01(score * 0.75 + quadFill * 0.25);

    if (!best || score > best.score) {
      best = { bounds, confidence, score };
    }
  }

  if (!best) return null;
  // If still weak, fail safely and let manual crop handle it.
  if (best.score < 0.32) return null;
  return { bounds: best.bounds, confidence: best.confidence };
}

/**
 * Calculate variance of an array
 */
function calculateVariance(arr: number[]): number {
  if (arr.length === 0) return Infinity;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Detect document by color contrast (fallback method)
 */
function detectByColorContrast(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { bounds: CropBounds; confidence: number } | null {
  // Sample colors from corners (background) and center (document)
  const sampleSize = Math.floor(Math.min(width, height) * 0.1);
  
  // Sample corner colors
  const cornerSamples: number[][] = [];
  const cornerPositions = [
    [0, 0], [width - sampleSize, 0],
    [0, height - sampleSize], [width - sampleSize, height - sampleSize]
  ];
  
  for (const [sx, sy] of cornerPositions) {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let y = sy; y < sy + sampleSize && y < height; y++) {
      for (let x = sx; x < sx + sampleSize && x < width; x++) {
        const idx = (y * width + x) * 4;
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }
    }
    if (count > 0) {
      cornerSamples.push([rSum / count, gSum / count, bSum / count]);
    }
  }
  
  // Average corner color (assumed background)
  const bgColor = cornerSamples.reduce(
    (acc, s) => [acc[0] + s[0] / cornerSamples.length, acc[1] + s[1] / cornerSamples.length, acc[2] + s[2] / cornerSamples.length],
    [0, 0, 0]
  );
  
  // Find document boundaries based on color difference from background
  const colorThreshold = 30;
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let foundPixels = 0;
  
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      
      const colorDiff = Math.sqrt(
        Math.pow(r - bgColor[0], 2) +
        Math.pow(g - bgColor[1], 2) +
        Math.pow(b - bgColor[2], 2)
      );
      
      if (colorDiff > colorThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        foundPixels++;
      }
    }
  }
  
  // Validate found region
  const regionWidth = maxX - minX;
  const regionHeight = maxY - minY;
  const areaRatio = (regionWidth * regionHeight) / (width * height);
  
  if (areaRatio < MIN_CONTOUR_AREA_RATIO || areaRatio > MAX_CONTOUR_AREA_RATIO) {
    return null;
  }

  // Reject near-border regions (likely background)
  const borderMargin = Math.max(10, Math.round(Math.min(width, height) * 0.02));
  if (
    minX <= borderMargin ||
    minY <= borderMargin ||
    maxX >= width - 1 - borderMargin ||
    maxY >= height - 1 - borderMargin
  ) {
    return null;
  }

  // Reject strange aspect ratios
  const aspect = regionWidth / Math.max(1, regionHeight);
  if (aspect < 0.45 || aspect > 2.2) return null;

  // Center-weighted
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dx = cx - width / 2;
  const dy = cy - height / 2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const diag = Math.sqrt(width * width + height * height);
  const centerScore = clamp01(1 - dist / (diag * 0.55));
  if (centerScore < 0.35) return null;
  
  // Add small padding
  const padding = Math.floor(Math.min(width, height) * 0.01);
  minX = Math.max(0, minX - padding);
  maxX = Math.min(width - 1, maxX + padding);
  minY = Math.max(0, minY - padding);
  maxY = Math.min(height - 1, maxY + padding);
  
  return {
    bounds: {
      topLeft: { x: minX, y: minY },
      topRight: { x: maxX, y: minY },
      bottomLeft: { x: minX, y: maxY },
      bottomRight: { x: maxX, y: maxY },
    },
    // Keep conservative so scanDocument won't auto-apply unless truly confident.
    confidence: clamp01(0.30 + centerScore * 0.18)
  };
}

/**
 * Refine corner positions by looking for edge intersections
 */
function refineCorners(
  edges: Uint8Array,
  width: number,
  height: number,
  left: number,
  right: number,
  top: number,
  bottom: number
): CropBounds {
  const searchRadius = Math.floor(Math.min(width, height) * 0.08);
  
  const findCorner = (cx: number, cy: number): { x: number; y: number } => {
    let bestX = cx, bestY = cy;
    let maxStrength = 0;
    
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        // Calculate corner strength (Harris-like measure)
        let horizontalEdge = 0;
        let verticalEdge = 0;
        
        for (let ky = -2; ky <= 2; ky++) {
          for (let kx = -2; kx <= 2; kx++) {
            const nx = x + kx, ny = y + ky;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (edges[ny * width + nx] > 0) {
                if (Math.abs(kx) > Math.abs(ky)) horizontalEdge++;
                else verticalEdge++;
              }
            }
          }
        }
        
        // Corner has both horizontal and vertical edges
        const strength = Math.min(horizontalEdge, verticalEdge);
        if (strength > maxStrength) {
          maxStrength = strength;
          bestX = x;
          bestY = y;
        }
      }
    }
    
    return { x: bestX, y: bestY };
  };
  
  return {
    topLeft: findCorner(left, top),
    topRight: findCorner(right, top),
    bottomLeft: findCorner(left, bottom),
    bottomRight: findCorner(right, bottom),
  };
}

/**
 * Apply perspective correction using bilinear interpolation
 */
function applyPerspectiveCorrection(
  srcData: ImageData,
  srcWidth: number,
  srcHeight: number,
  boundsScaled: CropBounds
): { data: ImageData; width: number; height: number } | null {
  const src = boundsScaled;
  
  // Calculate output dimensions
  const topWidth = Math.sqrt(
    Math.pow(src.topRight.x - src.topLeft.x, 2) + 
    Math.pow(src.topRight.y - src.topLeft.y, 2)
  );
  const bottomWidth = Math.sqrt(
    Math.pow(src.bottomRight.x - src.bottomLeft.x, 2) + 
    Math.pow(src.bottomRight.y - src.bottomLeft.y, 2)
  );
  const leftHeight = Math.sqrt(
    Math.pow(src.bottomLeft.x - src.topLeft.x, 2) + 
    Math.pow(src.bottomLeft.y - src.topLeft.y, 2)
  );
  const rightHeight = Math.sqrt(
    Math.pow(src.bottomRight.x - src.topRight.x, 2) + 
    Math.pow(src.bottomRight.y - src.topRight.y, 2)
  );
  
  const dstWidth = Math.min(MAX_PROCESS_WIDTH, Math.round(Math.max(topWidth, bottomWidth)));
  const dstHeight = Math.round(Math.max(leftHeight, rightHeight) * (dstWidth / Math.max(topWidth, bottomWidth)));
  
  if (dstWidth < 100 || dstHeight < 100) return null;
  
  const dstData = new ImageData(dstWidth, dstHeight);
  
  // Perspective transform using bilinear interpolation
  for (let dy = 0; dy < dstHeight; dy++) {
    for (let dx = 0; dx < dstWidth; dx++) {
      const u = dx / dstWidth;
      const v = dy / dstHeight;
      
      // Bilinear interpolation of source coordinates
      const topX = src.topLeft.x + u * (src.topRight.x - src.topLeft.x);
      const topY = src.topLeft.y + u * (src.topRight.y - src.topLeft.y);
      const bottomX = src.bottomLeft.x + u * (src.bottomRight.x - src.bottomLeft.x);
      const bottomY = src.bottomLeft.y + u * (src.bottomRight.y - src.bottomLeft.y);
      
      const srcX = topX + v * (bottomX - topX);
      const srcY = topY + v * (bottomY - topY);
      
      // Bilinear sampling from source
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
          
          const value = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + 
                       v01 * (1 - fx) * fy + v11 * fx * fy;
          dstData.data[dstIdx + c] = Math.round(value);
        }
        dstData.data[dstIdx + 3] = 255;
      }
    }
  }
  
  return { data: dstData, width: dstWidth, height: dstHeight };
}

/**
 * Fast shadow removal using block-based normalization
 */
function removeShadowsFast(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  const blockSize = Math.max(24, Math.floor(Math.min(width, height) / 12));
  const targetBrightness = 225;
  
  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      const endY = Math.min(by + blockSize, height);
      const endX = Math.min(bx + blockSize, width);
      
      // Calculate block average
      let sum = 0, count = 0;
      for (let y = by; y < endY; y += 3) {
        for (let x = bx; x < endX; x += 3) {
          const idx = (y * width + x) * 4;
          sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          count++;
        }
      }
      
      const avgBrightness = sum / count;
      
      if (avgBrightness < targetBrightness && avgBrightness > 40) {
        const factor = Math.min(1.35, targetBrightness / avgBrightness);
        
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

/**
 * Fast contrast enhancement using histogram stretching
 */
function enhanceContrastFast(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Find min/max (sampling for speed)
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 20) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness < min) min = Math.floor(brightness);
    if (brightness > max) max = Math.ceil(brightness);
  }
  
  // Apply stretch
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

/**
 * Fast sharpening for text clarity
 */
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

/**
 * Apply color filter
 */
function applyFilter(imageData: ImageData, filter: ScanFilter): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  switch (filter) {
    case 'grayscale':
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        result.data[i] = gray;
        result.data[i + 1] = gray;
        result.data[i + 2] = gray;
      }
      break;
      
    case 'blackwhite':
      // Adaptive thresholding for crisp B&W
      const blockSize = 15;
      const grayValues = new Uint8Array(width * height);
      
      for (let i = 0; i < data.length; i += 4) {
        grayValues[i >> 2] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      }
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const grayIdx = y * width + x;
          
          // Calculate local mean
          let sum = 0, count = 0;
          const startY = Math.max(0, y - blockSize);
          const endY = Math.min(height, y + blockSize);
          const startX = Math.max(0, x - blockSize);
          const endX = Math.min(width, x + blockSize);
          
          for (let sy = startY; sy < endY; sy += 3) {
            for (let sx = startX; sx < endX; sx += 3) {
              sum += grayValues[sy * width + sx];
              count++;
            }
          }
          
          const threshold = (sum / count) - 10;
          const value = grayValues[grayIdx] > threshold ? 255 : 0;
          
          result.data[idx] = value;
          result.data[idx + 1] = value;
          result.data[idx + 2] = value;
        }
      }
      break;
      
    case 'color':
    default:
      // Slight saturation boost
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
        const saturation = 1.15;
        
        result.data[i] = Math.min(255, Math.max(0, gray + (r - gray) * saturation));
        result.data[i + 1] = Math.min(255, Math.max(0, gray + (g - gray) * saturation));
        result.data[i + 2] = Math.min(255, Math.max(0, gray + (b - gray) * saturation));
      }
      break;
  }
  
  return result;
}

/**
 * Load image from various sources
 */
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

/**
 * Convert File to data URL
 */
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
  
  if (scale < 1) {
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const result = detectDocumentContourImproved(imageData, width, height);

  if (!result?.bounds) return null;
  // Convert bounds back to ORIGINAL image coordinates for UI/manual crop overlay.
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
  
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  imageData = applyFilter(imageData, filter);
  ctx.putImageData(imageData, 0, 0);
  
  return canvas.toDataURL('image/jpeg', 0.92);
}
