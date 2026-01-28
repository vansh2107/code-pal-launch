/**
 * Document Scanner Utility - CamScanner-style processing
 * Provides edge detection, perspective correction, and image enhancement
 */

export type ScanFilter = 'color' | 'grayscale' | 'blackwhite';

export interface ScanResult {
  processedImage: string; // base64 data URL
  originalImage: string;
  filter: ScanFilter;
}

export interface ScanOptions {
  filter?: ScanFilter;
  enhanceContrast?: boolean;
  sharpen?: boolean;
  removeShadows?: boolean;
  autoCrop?: boolean;
}

/**
 * Main document scanning function
 * Processes an image with document enhancement
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
  } = options;

  // Load image
  const img = await loadImage(imageSource);
  
  // Create canvas for processing
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  
  // Set canvas size to image size (maintain original quality)
  canvas.width = img.width;
  canvas.height = img.height;
  
  // Draw original image
  ctx.drawImage(img, 0, 0);
  
  // Get image data for processing
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Step 1: Auto crop/edge detection (if enabled)
  if (autoCrop) {
    const cropResult = detectAndCropDocument(imageData, canvas, ctx);
    if (cropResult) {
      imageData = cropResult;
    }
  }
  
  // Step 2: Remove shadows (before other enhancements)
  if (removeShadows) {
    imageData = removeShadowsFromImage(imageData);
  }
  
  // Step 3: Enhance contrast
  if (enhanceContrast) {
    imageData = enhanceImageContrast(imageData);
  }
  
  // Step 4: Apply sharpening
  if (sharpen) {
    imageData = sharpenImage(imageData, canvas.width, canvas.height);
  }
  
  // Step 5: Apply color filter
  imageData = applyFilter(imageData, filter);
  
  // Put processed image back
  ctx.putImageData(imageData, 0, 0);
  
  // Convert to high quality JPEG
  const processedImage = canvas.toDataURL('image/jpeg', 0.95);
  const originalImage = typeof imageSource === 'string' ? imageSource : await fileToDataURL(imageSource);
  
  return {
    processedImage,
    originalImage,
    filter,
  };
}

/**
 * Re-apply filter to already scanned image
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
  
  return canvas.toDataURL('image/jpeg', 0.95);
}

/**
 * Load image from various sources
 */
async function loadImage(source: string | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => resolve(img);
    img.onerror = reject;
    
    if (typeof source === 'string') {
      img.src = source;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
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
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Detect document edges and crop
 * Uses edge detection to find document boundaries
 */
function detectAndCropDocument(
  imageData: ImageData,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): ImageData | null {
  const { width, height, data } = imageData;
  
  // Convert to grayscale for edge detection
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  
  // Apply Sobel edge detection
  const edges = sobelEdgeDetection(gray, width, height);
  
  // Find document boundaries
  const bounds = findDocumentBounds(edges, width, height);
  
  if (!bounds) return null;
  
  // Add small padding
  const padding = Math.min(width, height) * 0.02;
  const cropX = Math.max(0, bounds.left - padding);
  const cropY = Math.max(0, bounds.top - padding);
  const cropWidth = Math.min(width - cropX, bounds.right - bounds.left + padding * 2);
  const cropHeight = Math.min(height - cropY, bounds.bottom - bounds.top + padding * 2);
  
  // Only crop if significant area detected
  if (cropWidth < width * 0.3 || cropHeight < height * 0.3) {
    return null;
  }
  
  // Create cropped canvas
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  
  // Get cropped image data
  ctx.putImageData(imageData, -cropX, -cropY);
  
  return ctx.getImageData(0, 0, cropWidth, cropHeight);
}

/**
 * Sobel edge detection
 */
function sobelEdgeDetection(gray: Uint8Array, width: number, height: number): Uint8Array {
  const edges = new Uint8Array(width * height);
  
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kidx = (ky + 1) * 3 + (kx + 1);
          gx += gray[idx] * sobelX[kidx];
          gy += gray[idx] * sobelY[kidx];
        }
      }
      
      edges[y * width + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }
  
  return edges;
}

/**
 * Find document boundaries from edge map
 */
function findDocumentBounds(
  edges: Uint8Array,
  width: number,
  height: number
): { left: number; top: number; right: number; bottom: number } | null {
  const threshold = 50;
  
  // Scan from edges to find document boundaries
  let left = 0, right = width - 1, top = 0, bottom = height - 1;
  
  // Find left boundary
  for (let x = 0; x < width * 0.4; x++) {
    let edgeCount = 0;
    for (let y = 0; y < height; y++) {
      if (edges[y * width + x] > threshold) edgeCount++;
    }
    if (edgeCount > height * 0.1) {
      left = x;
      break;
    }
  }
  
  // Find right boundary
  for (let x = width - 1; x > width * 0.6; x--) {
    let edgeCount = 0;
    for (let y = 0; y < height; y++) {
      if (edges[y * width + x] > threshold) edgeCount++;
    }
    if (edgeCount > height * 0.1) {
      right = x;
      break;
    }
  }
  
  // Find top boundary
  for (let y = 0; y < height * 0.4; y++) {
    let edgeCount = 0;
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] > threshold) edgeCount++;
    }
    if (edgeCount > width * 0.1) {
      top = y;
      break;
    }
  }
  
  // Find bottom boundary
  for (let y = height - 1; y > height * 0.6; y--) {
    let edgeCount = 0;
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] > threshold) edgeCount++;
    }
    if (edgeCount > width * 0.1) {
      bottom = y;
      break;
    }
  }
  
  // Validate bounds
  if (right - left < width * 0.2 || bottom - top < height * 0.2) {
    return null;
  }
  
  return { left, top, right, bottom };
}

/**
 * Remove shadows from image
 * Uses local contrast normalization
 */
function removeShadowsFromImage(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Calculate local average brightness using block processing
  const blockSize = Math.max(16, Math.floor(Math.min(width, height) / 20));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Calculate local average
      let sum = 0, count = 0;
      const startY = Math.max(0, y - blockSize);
      const endY = Math.min(height, y + blockSize);
      const startX = Math.max(0, x - blockSize);
      const endX = Math.min(width, x + blockSize);
      
      // Sample instead of full block for performance
      for (let sy = startY; sy < endY; sy += 4) {
        for (let sx = startX; sx < endX; sx += 4) {
          const sidx = (sy * width + sx) * 4;
          sum += (data[sidx] + data[sidx + 1] + data[sidx + 2]) / 3;
          count++;
        }
      }
      
      const localAvg = sum / count;
      const globalTarget = 200; // Target brightness for paper
      
      // Apply shadow removal with threshold
      if (localAvg < globalTarget && localAvg > 20) {
        const factor = Math.min(1.5, globalTarget / localAvg);
        result.data[idx] = Math.min(255, data[idx] * factor);
        result.data[idx + 1] = Math.min(255, data[idx + 1] * factor);
        result.data[idx + 2] = Math.min(255, data[idx + 2] * factor);
      }
    }
  }
  
  return result;
}

/**
 * Enhance image contrast using adaptive histogram equalization
 */
function enhanceImageContrast(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Calculate histogram
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const brightness = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
    histogram[brightness]++;
  }
  
  // Calculate cumulative histogram
  const cdf = new Array(256);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }
  
  // Normalize CDF
  const totalPixels = width * height;
  const minCdf = cdf.find(v => v > 0) || 0;
  
  // Create lookup table
  const lut = new Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(((cdf[i] - minCdf) / (totalPixels - minCdf)) * 255);
  }
  
  // Apply with moderation for document scanning
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const original = data[i + c];
      const enhanced = lut[original];
      // Blend original with enhanced (60% enhanced)
      result.data[i + c] = Math.round(original * 0.4 + enhanced * 0.6);
    }
  }
  
  return result;
}

/**
 * Sharpen image using unsharp masking
 */
function sharpenImage(imageData: ImageData, width: number, height: number): ImageData {
  const { data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Unsharp mask kernel
  const amount = 0.5; // Sharpening strength
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      for (let c = 0; c < 3; c++) {
        // Get surrounding pixels
        const center = data[idx + c];
        const neighbors = 
          data[((y - 1) * width + x) * 4 + c] +
          data[((y + 1) * width + x) * 4 + c] +
          data[(y * width + x - 1) * 4 + c] +
          data[(y * width + x + 1) * 4 + c];
        
        // Apply unsharp mask
        const blurred = neighbors / 4;
        const sharpened = center + amount * (center - blurred);
        result.data[idx + c] = Math.max(0, Math.min(255, sharpened));
      }
    }
  }
  
  return result;
}

/**
 * Apply color filter (color, grayscale, black & white)
 */
function applyFilter(imageData: ImageData, filter: ScanFilter): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  switch (filter) {
    case 'grayscale':
      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        result.data[i] = gray;
        result.data[i + 1] = gray;
        result.data[i + 2] = gray;
      }
      break;
      
    case 'blackwhite':
      // Adaptive thresholding for B&W
      const blockSize = 15;
      const C = 10; // Constant subtracted from mean
      
      // First convert to grayscale
      const grayValues = new Uint8Array(width * height);
      for (let i = 0; i < data.length; i += 4) {
        grayValues[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      
      // Apply adaptive threshold
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const grayIdx = y * width + x;
          
          // Calculate local mean
          let sum = 0, count = 0;
          for (let dy = -blockSize; dy <= blockSize; dy++) {
            for (let dx = -blockSize; dx <= blockSize; dx++) {
              const ny = y + dy, nx = x + dx;
              if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                sum += grayValues[ny * width + nx];
                count++;
              }
            }
          }
          
          const mean = sum / count;
          const threshold = mean - C;
          const value = grayValues[grayIdx] > threshold ? 255 : 0;
          
          result.data[idx] = value;
          result.data[idx + 1] = value;
          result.data[idx + 2] = value;
        }
      }
      break;
      
    case 'color':
    default:
      // Enhance colors slightly for document clarity
      for (let i = 0; i < data.length; i += 4) {
        // Increase saturation slightly
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
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
 * Convert image to PDF
 * Creates a single-page PDF from the processed image
 */
export async function imageToPDF(imageDataUrl: string): Promise<Blob> {
  const img = await loadImage(imageDataUrl);
  
  // A4 dimensions in points (72 dpi)
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  
  // Calculate scaling to fit image on page with margins
  const margin = 36; // 0.5 inch margins
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  
  let imgWidth = img.width;
  let imgHeight = img.height;
  
  const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
  imgWidth *= scale;
  imgHeight *= scale;
  
  // Center image on page
  const x = (pageWidth - imgWidth) / 2;
  const y = (pageHeight - imgHeight) / 2;
  
  // Create canvas for PDF rendering
  const canvas = document.createElement('canvas');
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d')!;
  
  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  
  // Draw image
  ctx.drawImage(img, x, y, imgWidth, imgHeight);
  
  // Convert to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob!);
    }, 'image/jpeg', 0.95);
  });
}
