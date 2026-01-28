/**
 * Document Scanner Utility - CamScanner-style processing
 * Fast auto-crop with edge detection, perspective correction, and enhancement
 */

export type ScanFilter = 'color' | 'grayscale' | 'blackwhite';

export interface ScanResult {
  processedImage: string;
  originalImage: string;
  filter: ScanFilter;
  cropBounds?: CropBounds;
  autoCropApplied: boolean;
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

// Constants for performance
const MAX_PROCESS_WIDTH = 1200;
const EDGE_THRESHOLD = 40;
const MIN_CONTOUR_AREA_RATIO = 0.15;

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
  
  // Step 1: Auto-crop with edge detection
  if (autoCrop && !cropBounds) {
    const detection = detectDocumentContour(imageData, width, height);
    if (detection) {
      detectedBounds = detection.bounds;
      // Apply perspective correction and crop
      const corrected = applyPerspectiveCorrection(ctx, img, detection.bounds, scale);
      if (corrected) {
        canvas.width = corrected.width;
        canvas.height = corrected.height;
        ctx.putImageData(corrected.data, 0, 0);
        imageData = corrected.data;
        autoCropApplied = true;
      }
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
  };
}

/**
 * Detect document contour using edge detection and contour finding
 */
function detectDocumentContour(
  imageData: ImageData,
  width: number,
  height: number
): { bounds: CropBounds } | null {
  const { data } = imageData;
  
  // Convert to grayscale
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  
  // Apply Gaussian blur for noise reduction
  const blurred = gaussianBlur(gray, width, height);
  
  // Canny-like edge detection
  const edges = detectEdges(blurred, width, height);
  
  // Find largest rectangular contour
  const contour = findLargestRectContour(edges, width, height);
  
  if (!contour) {
    // Fallback: use simple boundary detection
    return detectSimpleBounds(edges, width, height);
  }
  
  return { bounds: contour };
}

/**
 * Fast Gaussian blur (3x3 kernel)
 */
function gaussianBlur(gray: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(width * height);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kernelSum = 16;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += gray[(y + ky) * width + (x + kx)] * kernel[ki++];
        }
      }
      result[y * width + x] = sum / kernelSum;
    }
  }
  
  return result;
}

/**
 * Edge detection using Sobel operator
 */
function detectEdges(gray: Uint8Array, width: number, height: number): Uint8Array {
  const edges = new Uint8Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Sobel X
      const gx = 
        -gray[(y - 1) * width + (x - 1)] + gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] + 2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] + gray[(y + 1) * width + (x + 1)];
      
      // Sobel Y
      const gy = 
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[idx] = magnitude > EDGE_THRESHOLD ? 255 : 0;
    }
  }
  
  return edges;
}

/**
 * Find largest rectangular contour using Hough-like line detection
 */
function findLargestRectContour(
  edges: Uint8Array,
  width: number,
  height: number
): CropBounds | null {
  // Scan for edges from all four sides
  const margin = Math.floor(Math.min(width, height) * 0.02);
  const scanDepth = Math.floor(Math.min(width, height) * 0.35);
  const minEdgeStrength = Math.floor(Math.min(width, height) * 0.08);
  
  // Find boundaries by scanning inward
  let left = margin, right = width - margin - 1;
  let top = margin, bottom = height - margin - 1;
  
  // Left edge
  for (let x = margin; x < margin + scanDepth; x++) {
    let strength = 0;
    for (let y = margin; y < height - margin; y += 2) {
      if (edges[y * width + x]) strength++;
    }
    if (strength > minEdgeStrength) {
      left = x;
      break;
    }
  }
  
  // Right edge
  for (let x = width - margin - 1; x > width - margin - scanDepth; x--) {
    let strength = 0;
    for (let y = margin; y < height - margin; y += 2) {
      if (edges[y * width + x]) strength++;
    }
    if (strength > minEdgeStrength) {
      right = x;
      break;
    }
  }
  
  // Top edge
  for (let y = margin; y < margin + scanDepth; y++) {
    let strength = 0;
    for (let x = margin; x < width - margin; x += 2) {
      if (edges[y * width + x]) strength++;
    }
    if (strength > minEdgeStrength) {
      top = y;
      break;
    }
  }
  
  // Bottom edge
  for (let y = height - margin - 1; y > height - margin - scanDepth; y--) {
    let strength = 0;
    for (let x = margin; x < width - margin; x += 2) {
      if (edges[y * width + x]) strength++;
    }
    if (strength > minEdgeStrength) {
      bottom = y;
      break;
    }
  }
  
  // Validate contour size
  const contourWidth = right - left;
  const contourHeight = bottom - top;
  const areaRatio = (contourWidth * contourHeight) / (width * height);
  
  if (areaRatio < MIN_CONTOUR_AREA_RATIO) {
    return null;
  }
  
  // Find corner refinement by looking for edge intersections
  const corners = refineCorners(edges, width, height, left, right, top, bottom);
  
  return corners;
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
  const searchRadius = Math.floor(Math.min(width, height) * 0.05);
  
  // Helper to find strongest edge point in region
  const findCorner = (cx: number, cy: number): { x: number; y: number } => {
    let bestX = cx, bestY = cy, maxStrength = 0;
    
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        // Calculate local edge strength
        let strength = 0;
        for (let ky = -2; ky <= 2; ky++) {
          for (let kx = -2; kx <= 2; kx++) {
            const nx = x + kx, ny = y + ky;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (edges[ny * width + nx]) strength++;
            }
          }
        }
        
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
 * Simple boundary detection fallback
 */
function detectSimpleBounds(
  edges: Uint8Array,
  width: number,
  height: number
): { bounds: CropBounds } | null {
  const margin = Math.floor(Math.min(width, height) * 0.05);
  
  // Default to slight inset from edges
  const bounds: CropBounds = {
    topLeft: { x: margin, y: margin },
    topRight: { x: width - margin, y: margin },
    bottomLeft: { x: margin, y: height - margin },
    bottomRight: { x: width - margin, y: height - margin },
  };
  
  return { bounds };
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
        const gray = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        result.data[i] = gray;
        result.data[i + 1] = gray;
        result.data[i + 2] = gray;
      }
      break;
      
    case 'blackwhite':
      // Adaptive thresholding for crisp B&W
      const blockSize = 12;
      const grayValues = new Uint8Array(width * height);
      
      for (let i = 0; i < data.length; i += 4) {
        grayValues[i >> 2] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
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
          
          const threshold = (sum / count) - 12;
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
        const gray = (r * 77 + g * 150 + b * 29) >> 8;
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
  const result = detectDocumentContour(imageData, width, height);
  
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
