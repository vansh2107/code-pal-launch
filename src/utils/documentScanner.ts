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
const MIN_CONTOUR_AREA_RATIO = 0.10; // Minimum 10% of image area
const MAX_CONTOUR_AREA_RATIO = 0.98; // Maximum 98% of image area
const CANNY_LOW_THRESHOLD = 50;
const CANNY_HIGH_THRESHOLD = 150;

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
  let detectedBounds: CropBounds | undefined;
  let autoCropApplied = false;
  let confidence = 0;
  
  // Step 1: Auto-crop with improved edge detection
  if (autoCrop && !cropBounds) {
    const detection = detectDocumentContourImproved(imageData, width, height);
    if (detection && detection.confidence > 0.3) {
      detectedBounds = detection.bounds;
      confidence = detection.confidence;
      
      // Apply perspective correction and crop
      const corrected = applyPerspectiveCorrection(ctx, img, detection.bounds, scale);
      if (corrected) {
        canvas.width = corrected.width;
        canvas.height = corrected.height;
        ctx.putImageData(corrected.data, 0, 0);
        imageData = corrected.data;
        autoCropApplied = true;
      }
    } else if (detection) {
      // Store low-confidence bounds for manual adjustment
      detectedBounds = detection.bounds;
      confidence = detection.confidence;
    }
  } else if (cropBounds) {
    // Apply manual crop with perspective correction
    const corrected = applyPerspectiveCorrection(ctx, img, cropBounds, scale);
    if (corrected) {
      canvas.width = corrected.width;
      canvas.height = corrected.height;
      ctx.putImageData(corrected.data, 0, 0);
      imageData = corrected.data;
      autoCropApplied = true;
      confidence = 1.0; // Manual crop is always confident
    }
  }
  
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
  
  // Convert to high quality JPEG
  const processedImage = canvas.toDataURL('image/jpeg', 0.92);
  
  return {
    processedImage,
    originalImage,
    filter,
    cropBounds: detectedBounds,
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
  
  // Stage 2: Apply bilateral filter for noise reduction while preserving edges
  const smoothed = bilateralFilter(gray, width, height);
  
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
  const margin = Math.floor(Math.min(width, height) * 0.02);
  const scanStep = 2;
  
  // Scan from all four sides to find edge lines
  const leftEdges: number[] = [];
  const rightEdges: number[] = [];
  const topEdges: number[] = [];
  const bottomEdges: number[] = [];
  
  // Scan for left edge
  for (let y = margin; y < height - margin; y += scanStep) {
    for (let x = margin; x < width / 2; x++) {
      if (edges[y * width + x] > 0) {
        leftEdges.push(x);
        break;
      }
    }
  }
  
  // Scan for right edge
  for (let y = margin; y < height - margin; y += scanStep) {
    for (let x = width - margin - 1; x > width / 2; x--) {
      if (edges[y * width + x] > 0) {
        rightEdges.push(x);
        break;
      }
    }
  }
  
  // Scan for top edge
  for (let x = margin; x < width - margin; x += scanStep) {
    for (let y = margin; y < height / 2; y++) {
      if (edges[y * width + x] > 0) {
        topEdges.push(y);
        break;
      }
    }
  }
  
  // Scan for bottom edge
  for (let x = margin; x < width - margin; x += scanStep) {
    for (let y = height - margin - 1; y > height / 2; y--) {
      if (edges[y * width + x] > 0) {
        bottomEdges.push(y);
        break;
      }
    }
  }
  
  // Calculate robust statistics (median) for each edge
  const getMedian = (arr: number[]): number => {
    if (arr.length === 0) return -1;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  
  const left = getMedian(leftEdges);
  const right = getMedian(rightEdges);
  const top = getMedian(topEdges);
  const bottom = getMedian(bottomEdges);
  
  // Validate detection
  if (left < 0 || right < 0 || top < 0 || bottom < 0) {
    return null;
  }
  
  const contourWidth = right - left;
  const contourHeight = bottom - top;
  const areaRatio = (contourWidth * contourHeight) / (width * height);
  
  // Check if contour is valid
  if (areaRatio < MIN_CONTOUR_AREA_RATIO || areaRatio > MAX_CONTOUR_AREA_RATIO) {
    return null;
  }
  
  // Check aspect ratio (should be document-like)
  const aspectRatio = contourWidth / contourHeight;
  if (aspectRatio < 0.3 || aspectRatio > 3.0) {
    return null;
  }
  
  // Refine corners by finding actual edge intersections
  const bounds = refineCorners(edges, width, height, left, right, top, bottom);
  
  // Calculate confidence based on edge consistency
  const leftVariance = calculateVariance(leftEdges);
  const rightVariance = calculateVariance(rightEdges);
  const topVariance = calculateVariance(topEdges);
  const bottomVariance = calculateVariance(bottomEdges);
  
  const avgVariance = (leftVariance + rightVariance + topVariance + bottomVariance) / 4;
  const maxAcceptableVariance = Math.min(width, height) * 0.1;
  const confidence = Math.max(0, Math.min(1, 1 - (avgVariance / maxAcceptableVariance)));
  
  return { bounds, confidence };
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
    confidence: 0.4 // Lower confidence for color-based detection
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
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  bounds: CropBounds,
  scale: number
): { data: ImageData; width: number; height: number } | null {
  // Convert bounds to original image coordinates
  const src = {
    topLeft: { x: bounds.topLeft.x / scale, y: bounds.topLeft.y / scale },
    topRight: { x: bounds.topRight.x / scale, y: bounds.topRight.y / scale },
    bottomLeft: { x: bounds.bottomLeft.x / scale, y: bounds.bottomLeft.y / scale },
    bottomRight: { x: bounds.bottomRight.x / scale, y: bounds.bottomRight.y / scale },
  };
  
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
  
  // Create source canvas from original image
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, img.width, img.height);
  
  // Create destination canvas
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstWidth;
  dstCanvas.height = dstHeight;
  const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true })!;
  const dstData = dstCtx.createImageData(dstWidth, dstHeight);
  
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
      const x1 = Math.min(x0 + 1, img.width - 1);
      const y1 = Math.min(y0 + 1, img.height - 1);
      const fx = srcX - x0;
      const fy = srcY - y0;
      
      if (x0 >= 0 && x0 < img.width && y0 >= 0 && y0 < img.height) {
        const dstIdx = (dy * dstWidth + dx) * 4;
        
        for (let c = 0; c < 3; c++) {
          const v00 = srcData.data[(y0 * img.width + x0) * 4 + c];
          const v10 = srcData.data[(y0 * img.width + x1) * 4 + c];
          const v01 = srcData.data[(y1 * img.width + x0) * 4 + c];
          const v11 = srcData.data[(y1 * img.width + x1) * 4 + c];
          
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
  
  return result?.bounds || null;
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
