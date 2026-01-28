/**
 * Document Scanner Utility - Optimized CamScanner-style processing
 * Performance-optimized with proper edge detection and image enhancement
 */

export type ScanFilter = 'color' | 'grayscale' | 'blackwhite';

export interface ScanResult {
  processedImage: string;
  originalImage: string;
  filter: ScanFilter;
  cropBounds?: CropBounds;
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

// Processing cache to avoid reprocessing same image
const processedCache = new Map<string, ScanResult>();
const MAX_CACHE_SIZE = 5;

/**
 * Get cache key for image
 */
function getCacheKey(source: string | File, options: ScanOptions): string {
  const sourceKey = typeof source === 'string' ? source.slice(0, 100) : source.name + source.size;
  return `${sourceKey}-${options.filter}-${options.autoCrop}`;
}

/**
 * Clear oldest cache entries
 */
function trimCache() {
  if (processedCache.size > MAX_CACHE_SIZE) {
    const firstKey = processedCache.keys().next().value;
    if (firstKey) processedCache.delete(firstKey);
  }
}

/**
 * Main document scanning function - Optimized for speed
 */
export async function scanDocument(
  imageSource: string | File,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const {
    filter = 'color',
    enhanceContrast = true,
    sharpen = false, // Disabled by default for performance
    removeShadows = true,
    autoCrop = true,
    maxWidth = 1200, // Optimize: process at max 1200px width
    cropBounds,
  } = options;

  // Check cache first
  const cacheKey = getCacheKey(imageSource, options);
  const cached = processedCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Load and resize image for faster processing
  const img = await loadImage(imageSource);
  const originalImage = typeof imageSource === 'string' ? imageSource : await fileToDataURL(imageSource);
  
  // Calculate scaled dimensions
  let width = img.width;
  let height = img.height;
  
  if (width > maxWidth) {
    const scale = maxWidth / width;
    width = maxWidth;
    height = Math.round(img.height * scale);
  }
  
  // Create canvas for processing
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  
  canvas.width = width;
  canvas.height = height;
  
  // Draw scaled image
  ctx.drawImage(img, 0, 0, width, height);
  
  // Get image data for processing
  let imageData = ctx.getImageData(0, 0, width, height);
  let detectedBounds: CropBounds | undefined;
  
  // Step 1: Auto crop/edge detection (if enabled and no manual bounds)
  if (autoCrop && !cropBounds) {
    const result = detectDocumentBoundsOptimized(imageData, width, height);
    if (result) {
      detectedBounds = result.bounds;
      imageData = result.croppedData;
      canvas.width = imageData.width;
      canvas.height = imageData.height;
    }
  } else if (cropBounds) {
    // Apply manual crop bounds
    imageData = applyCropBounds(ctx, imageData, cropBounds, width, height);
    canvas.width = imageData.width;
    canvas.height = imageData.height;
  }
  
  // Step 2: Remove shadows (optimized)
  if (removeShadows) {
    imageData = removeShadowsFast(imageData);
  }
  
  // Step 3: Enhance contrast (optimized)
  if (enhanceContrast) {
    imageData = enhanceContrastFast(imageData);
  }
  
  // Step 4: Apply sharpening only if requested
  if (sharpen) {
    imageData = sharpenImageFast(imageData);
  }
  
  // Step 5: Apply color filter
  imageData = applyFilter(imageData, filter);
  
  // Put processed image back
  ctx.putImageData(imageData, 0, 0);
  
  // Convert to JPEG for smaller size
  const processedImage = canvas.toDataURL('image/jpeg', 0.92);
  
  const result: ScanResult = {
    processedImage,
    originalImage,
    filter,
    cropBounds: detectedBounds,
  };
  
  // Cache result
  trimCache();
  processedCache.set(cacheKey, result);
  
  return result;
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
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
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
 * Optimized document detection using fast edge detection
 */
function detectDocumentBoundsOptimized(
  imageData: ImageData,
  width: number,
  height: number
): { bounds: CropBounds; croppedData: ImageData } | null {
  const { data } = imageData;
  
  // Convert to grayscale for edge detection (fast)
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  
  // Simple and fast edge detection using gradient magnitude
  const edges = new Uint8Array(width * height);
  const threshold = 30;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Sobel-like gradient (simplified for speed)
      const gx = gray[idx + 1] - gray[idx - 1];
      const gy = gray[idx + width] - gray[idx - width];
      const mag = Math.abs(gx) + Math.abs(gy);
      
      edges[idx] = mag > threshold ? 255 : 0;
    }
  }
  
  // Find document bounds by scanning from edges
  let left = 0, right = width - 1, top = 0, bottom = height - 1;
  const scanDepth = Math.floor(Math.min(width, height) * 0.4);
  const minEdgeCount = Math.floor(Math.min(width, height) * 0.05);
  
  // Find left boundary
  for (let x = 0; x < scanDepth; x++) {
    let edgeCount = 0;
    for (let y = 0; y < height; y += 2) { // Skip every other row for speed
      if (edges[y * width + x]) edgeCount++;
    }
    if (edgeCount > minEdgeCount) {
      left = Math.max(0, x - 5);
      break;
    }
  }
  
  // Find right boundary
  for (let x = width - 1; x > width - scanDepth; x--) {
    let edgeCount = 0;
    for (let y = 0; y < height; y += 2) {
      if (edges[y * width + x]) edgeCount++;
    }
    if (edgeCount > minEdgeCount) {
      right = Math.min(width - 1, x + 5);
      break;
    }
  }
  
  // Find top boundary
  for (let y = 0; y < scanDepth; y++) {
    let edgeCount = 0;
    for (let x = 0; x < width; x += 2) {
      if (edges[y * width + x]) edgeCount++;
    }
    if (edgeCount > minEdgeCount) {
      top = Math.max(0, y - 5);
      break;
    }
  }
  
  // Find bottom boundary
  for (let y = height - 1; y > height - scanDepth; y--) {
    let edgeCount = 0;
    for (let x = 0; x < width; x += 2) {
      if (edges[y * width + x]) edgeCount++;
    }
    if (edgeCount > minEdgeCount) {
      bottom = Math.min(height - 1, y + 5);
      break;
    }
  }
  
  // Validate bounds - must be at least 30% of original
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  
  if (cropWidth < width * 0.3 || cropHeight < height * 0.3) {
    return null;
  }
  
  // Add padding
  const padding = Math.min(width, height) * 0.01;
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);
  
  // Create cropped image data
  const newWidth = Math.floor(right - left);
  const newHeight = Math.floor(bottom - top);
  const croppedData = new ImageData(newWidth, newHeight);
  
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcIdx = ((y + Math.floor(top)) * width + (x + Math.floor(left))) * 4;
      const dstIdx = (y * newWidth + x) * 4;
      croppedData.data[dstIdx] = data[srcIdx];
      croppedData.data[dstIdx + 1] = data[srcIdx + 1];
      croppedData.data[dstIdx + 2] = data[srcIdx + 2];
      croppedData.data[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  
  const bounds: CropBounds = {
    topLeft: { x: left, y: top },
    topRight: { x: right, y: top },
    bottomLeft: { x: left, y: bottom },
    bottomRight: { x: right, y: bottom },
  };
  
  return { bounds, croppedData };
}

/**
 * Apply manual crop bounds
 */
function applyCropBounds(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  bounds: CropBounds,
  width: number,
  height: number
): ImageData {
  const left = Math.min(bounds.topLeft.x, bounds.bottomLeft.x);
  const right = Math.max(bounds.topRight.x, bounds.bottomRight.x);
  const top = Math.min(bounds.topLeft.y, bounds.topRight.y);
  const bottom = Math.max(bounds.bottomLeft.y, bounds.bottomRight.y);
  
  const cropWidth = Math.floor(right - left);
  const cropHeight = Math.floor(bottom - top);
  
  if (cropWidth < 10 || cropHeight < 10) {
    return imageData;
  }
  
  const croppedData = new ImageData(cropWidth, cropHeight);
  const { data } = imageData;
  
  for (let y = 0; y < cropHeight; y++) {
    for (let x = 0; x < cropWidth; x++) {
      const srcIdx = ((y + Math.floor(top)) * width + (x + Math.floor(left))) * 4;
      const dstIdx = (y * cropWidth + x) * 4;
      croppedData.data[dstIdx] = data[srcIdx];
      croppedData.data[dstIdx + 1] = data[srcIdx + 1];
      croppedData.data[dstIdx + 2] = data[srcIdx + 2];
      croppedData.data[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  
  return croppedData;
}

/**
 * Fast shadow removal using block-based normalization
 */
function removeShadowsFast(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Use larger blocks for speed
  const blockSize = Math.max(32, Math.floor(Math.min(width, height) / 10));
  const targetBrightness = 220;
  
  // Process in blocks
  for (let by = 0; by < height; by += blockSize) {
    for (let bx = 0; bx < width; bx += blockSize) {
      const endY = Math.min(by + blockSize, height);
      const endX = Math.min(bx + blockSize, width);
      
      // Calculate block average
      let sum = 0, count = 0;
      for (let y = by; y < endY; y += 4) {
        for (let x = bx; x < endX; x += 4) {
          const idx = (y * width + x) * 4;
          sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          count++;
        }
      }
      
      const avgBrightness = sum / count;
      
      // Apply correction if block is darker than target
      if (avgBrightness < targetBrightness && avgBrightness > 30) {
        const factor = Math.min(1.4, targetBrightness / avgBrightness);
        
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
 * Fast contrast enhancement
 */
function enhanceContrastFast(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Find min/max brightness (sample for speed)
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness < min) min = brightness;
    if (brightness > max) max = brightness;
  }
  
  // Apply stretch with moderation
  const range = max - min;
  if (range < 50) return imageData; // Already good contrast
  
  const factor = 220 / range;
  const offset = -min * factor + 20;
  
  for (let i = 0; i < data.length; i += 4) {
    result.data[i] = Math.min(255, Math.max(0, data[i] * factor + offset));
    result.data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor + offset));
    result.data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor + offset));
  }
  
  return result;
}

/**
 * Fast sharpening using simple unsharp mask
 */
function sharpenImageFast(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const amount = 0.3;
  
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
      // Fast adaptive thresholding
      const blockSize = 8;
      const grayValues = new Uint8Array(width * height);
      
      for (let i = 0; i < data.length; i += 4) {
        grayValues[i >> 2] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      }
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const grayIdx = y * width + x;
          
          // Calculate local mean (simplified for speed)
          let sum = 0, count = 0;
          const startY = Math.max(0, y - blockSize);
          const endY = Math.min(height, y + blockSize);
          const startX = Math.max(0, x - blockSize);
          const endX = Math.min(width, x + blockSize);
          
          for (let sy = startY; sy < endY; sy += 2) {
            for (let sx = startX; sx < endX; sx += 2) {
              sum += grayValues[sy * width + sx];
              count++;
            }
          }
          
          const threshold = (sum / count) - 8;
          const value = grayValues[grayIdx] > threshold ? 255 : 0;
          
          result.data[idx] = value;
          result.data[idx + 1] = value;
          result.data[idx + 2] = value;
        }
      }
      break;
      
    case 'color':
    default:
      // Slight saturation boost for document clarity
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const gray = (r * 77 + g * 150 + b * 29) >> 8;
        const saturation = 1.1;
        
        result.data[i] = Math.min(255, Math.max(0, gray + (r - gray) * saturation));
        result.data[i + 1] = Math.min(255, Math.max(0, gray + (g - gray) * saturation));
        result.data[i + 2] = Math.min(255, Math.max(0, gray + (b - gray) * saturation));
      }
      break;
  }
  
  return result;
}

/**
 * Get detected crop bounds from an image (for manual adjustment UI)
 */
export async function detectCropBounds(
  imageSource: string | File,
  maxWidth: number = 800
): Promise<CropBounds | null> {
  const img = await loadImage(imageSource);
  
  let width = img.width;
  let height = img.height;
  
  if (width > maxWidth) {
    const scale = maxWidth / width;
    width = maxWidth;
    height = Math.round(img.height * scale);
  }
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const result = detectDocumentBoundsOptimized(imageData, width, height);
  
  return result?.bounds || null;
}

/**
 * Quick scan - minimal processing for speed
 */
export async function quickScan(
  imageSource: string | File
): Promise<ScanResult> {
  return scanDocument(imageSource, {
    filter: 'color',
    enhanceContrast: true,
    sharpen: false,
    removeShadows: false,
    autoCrop: true,
    maxWidth: 1000,
  });
}

/**
 * High quality scan - full processing
 */
export async function highQualityScan(
  imageSource: string | File
): Promise<ScanResult> {
  return scanDocument(imageSource, {
    filter: 'color',
    enhanceContrast: true,
    sharpen: true,
    removeShadows: true,
    autoCrop: true,
    maxWidth: 1600,
  });
}
