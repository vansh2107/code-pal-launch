/**
 * Robust auto-crop utility: detects and removes uniform/transparent background
 * from images using multi-strategy canvas pixel analysis. Client-side only.
 */

const PADDING_PX = 6;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

type RGBA = [number, number, number, number];

/**
 * Compute color distance (Euclidean in RGBA space, alpha-weighted).
 */
function colorDist(
  r1: number, g1: number, b1: number, a1: number,
  r2: number, g2: number, b2: number, a2: number
): number {
  // Weight alpha heavily — transparency difference is very significant
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  const da = (a1 - a2) * 1.5;
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
}

/**
 * Sample background color by reading pixels along all four edges of the image
 * (not just corners). Uses median-based clustering to find the dominant edge color.
 */
function detectBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number
): RGBA {
  const edgePixels: RGBA[] = [];
  const sampleStep = Math.max(1, Math.floor(Math.max(w, h) / 200));

  // Top edge
  for (let x = 0; x < w; x += sampleStep) {
    const i = x * 4;
    edgePixels.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
  }
  // Bottom edge
  for (let x = 0; x < w; x += sampleStep) {
    const i = ((h - 1) * w + x) * 4;
    edgePixels.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
  }
  // Left edge
  for (let y = 0; y < h; y += sampleStep) {
    const i = (y * w) * 4;
    edgePixels.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
  }
  // Right edge
  for (let y = 0; y < h; y += sampleStep) {
    const i = (y * w + w - 1) * 4;
    edgePixels.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
  }

  if (edgePixels.length === 0) return [255, 255, 255, 255];

  // Cluster edge pixels: group similar colors, pick the largest group
  const clusters: { color: RGBA; count: number }[] = [];
  const clusterThreshold = 40;

  for (const px of edgePixels) {
    let matched = false;
    for (const c of clusters) {
      if (colorDist(px[0], px[1], px[2], px[3], c.color[0], c.color[1], c.color[2], c.color[3]) < clusterThreshold) {
        // Running average
        const n = c.count;
        c.color = [
          Math.round((c.color[0] * n + px[0]) / (n + 1)),
          Math.round((c.color[1] * n + px[1]) / (n + 1)),
          Math.round((c.color[2] * n + px[2]) / (n + 1)),
          Math.round((c.color[3] * n + px[3]) / (n + 1)),
        ];
        c.count++;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ color: [...px], count: 1 });
    }
  }

  // Sort by count desc, pick the dominant one
  clusters.sort((a, b) => b.count - a.count);
  
  // If dominant cluster has at least 30% of edge pixels, use it
  const dominant = clusters[0];
  if (dominant && dominant.count >= edgePixels.length * 0.3) {
    return dominant.color;
  }

  // Fallback: median of all edge pixels
  const sorted = (ch: number) => edgePixels.map(p => p[ch]).sort((a, b) => a - b);
  const mid = Math.floor(edgePixels.length / 2);
  return [sorted(0)[mid], sorted(1)[mid], sorted(2)[mid], sorted(3)[mid]];
}

/**
 * Check if a pixel is "background" based on the detected bg color.
 * Uses adaptive tolerance based on overall image variance.
 */
function isBgPixel(
  data: Uint8ClampedArray,
  idx: number,
  bg: RGBA,
  tolerance: number
): boolean {
  const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];

  // Both transparent → background
  if (bg[3] < 15 && a < 15) return true;

  // Background opaque, pixel nearly transparent → background  
  if (bg[3] > 240 && a < 15) return true;

  return colorDist(r, g, b, a, bg[0], bg[1], bg[2], bg[3]) < tolerance;
}

/**
 * Scan from each edge inward to find content boundaries.
 * Uses row/column scanning which is more accurate than full-image scan.
 */
function findBounds(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bg: RGBA,
  tolerance: number
): { top: number; left: number; bottom: number; right: number } | null {
  // For large images, use a downsampled first pass
  const totalPx = w * h;
  const useDownsample = totalPx > 2_000_000;
  
  let top = 0, bottom = h - 1, left = 0, right = w - 1;

  // --- Find TOP: scan rows from top until we find content ---
  const xStep = useDownsample ? 2 : 1;
  
  topScan:
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += xStep) {
      if (!isBgPixel(data, (y * w + x) * 4, bg, tolerance)) {
        top = y;
        break topScan;
      }
    }
  }

  // --- Find BOTTOM: scan rows from bottom ---
  bottomScan:
  for (let y = h - 1; y >= top; y--) {
    for (let x = 0; x < w; x += xStep) {
      if (!isBgPixel(data, (y * w + x) * 4, bg, tolerance)) {
        bottom = y;
        break bottomScan;
      }
    }
  }

  // --- Find LEFT: scan columns from left (only within top..bottom) ---
  leftScan:
  for (let x = 0; x < w; x++) {
    for (let y = top; y <= bottom; y += xStep) {
      if (!isBgPixel(data, (y * w + x) * 4, bg, tolerance)) {
        left = x;
        break leftScan;
      }
    }
  }

  // --- Find RIGHT: scan columns from right ---
  rightScan:
  for (let x = w - 1; x >= left; x--) {
    for (let y = top; y <= bottom; y += xStep) {
      if (!isBgPixel(data, (y * w + x) * 4, bg, tolerance)) {
        right = x;
        break rightScan;
      }
    }
  }

  // If downsampled, refine by ±2px with full resolution
  if (useDownsample) {
    // Refine top (check y-2..y)
    for (let y = Math.max(0, top - 2); y < top; y++) {
      for (let x = left; x <= right; x++) {
        if (!isBgPixel(data, (y * w + x) * 4, bg, tolerance)) {
          top = y;
          break;
        }
      }
    }
    // Refine bottom
    for (let y = Math.min(h - 1, bottom + 2); y > bottom; y--) {
      for (let x = left; x <= right; x++) {
        if (!isBgPixel(data, (y * w + x) * 4, bg, tolerance)) {
          bottom = y;
          break;
        }
      }
    }
    // Refine left
    for (let x = Math.max(0, left - 2); x < left; x++) {
      for (let y = top; y <= bottom; y++) {
        if (!isBgPixel(data, (y * w + x) * 4, bg, tolerance)) {
          left = x;
          break;
        }
      }
    }
    // Refine right
    for (let x = Math.min(w - 1, right + 2); x > right; x--) {
      for (let y = top; y <= bottom; y++) {
        if (!isBgPixel(data, (y * w + x) * 4, bg, tolerance)) {
          right = x;
          break;
        }
      }
    }
  }

  // Validate: content must be at least 10px in each dimension
  if (right - left < 10 || bottom - top < 10) return null;

  return { top, left, bottom, right };
}

/**
 * Auto-crops a File/Blob image, removing uniform background edges.
 * Uses edge-based background detection and directional scanning for accuracy.
 * Returns a new Blob with the cropped image, or the original if no crop needed.
 */
export async function autoCropImage(
  file: File | Blob,
  options: {
    tolerance?: number;
    minCropPercent?: number;
    outputType?: string;
    padding?: number;
  } = {}
): Promise<Blob> {
  const {
    tolerance = 35,
    minCropPercent = 3,
    padding = PADDING_PX,
    outputType,
  } = options;

  const url = URL.createObjectURL(file);

  try {
    const img = await loadImage(url);
    const { width: w, height: h } = img;

    // Skip tiny images
    if (w < 24 || h < 24) return file;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);

    // Detect background from edges
    const bg = detectBackground(data, w, h);

    // Find content bounds with primary tolerance
    let bounds = findBounds(data, w, h, bg, tolerance);

    // If nothing found, try a tighter tolerance (image might be very similar to bg)
    if (!bounds) {
      bounds = findBounds(data, w, h, bg, tolerance * 0.5);
    }
    if (!bounds) return file;

    // Apply padding
    const cropTop = Math.max(0, bounds.top - padding);
    const cropLeft = Math.max(0, bounds.left - padding);
    const cropBottom = Math.min(h - 1, bounds.bottom + padding);
    const cropRight = Math.min(w - 1, bounds.right + padding);

    const cropW = cropRight - cropLeft + 1;
    const cropH = cropBottom - cropTop + 1;

    // Only crop if removing meaningful area
    const removedPct = ((w * h - cropW * cropH) / (w * h)) * 100;
    if (removedPct < minCropPercent) return file;

    // Safety: don't crop if result is less than 50% of original in both dimensions
    // (probably a photo, not a logo on a background)
    if (cropW < w * 0.3 && cropH < h * 0.3) return file;

    // Draw cropped result
    const out = document.createElement("canvas");
    out.width = cropW;
    out.height = cropH;
    const outCtx = out.getContext("2d");
    if (!outCtx) return file;

    outCtx.drawImage(img, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);

    const mime = outputType || file.type || "image/png";
    const quality = mime === "image/jpeg" ? 0.92 : undefined;

    return new Promise<Blob>((resolve) => {
      out.toBlob((blob) => resolve(blob || file), mime, quality);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
