/**
 * Auto-crop utility: detects and removes uniform/transparent background
 * from images using canvas pixel analysis. Fast, client-side only.
 */

const PADDING = 4; // px of padding around detected content

/**
 * Loads a File/Blob into an HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Determines whether a pixel differs enough from the reference background color.
 * Uses a tolerance threshold to handle compression artifacts / slight gradients.
 */
function isContentPixel(
  data: Uint8ClampedArray,
  idx: number,
  bgR: number,
  bgG: number,
  bgB: number,
  bgA: number,
  tolerance: number
): boolean {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  const a = data[idx + 3];

  // Transparent pixel on a transparent background → not content
  if (bgA < 10 && a < 10) return false;

  // If bg is opaque but pixel is very transparent → not content
  if (bgA > 240 && a < 10) return false;

  // Alpha difference
  if (Math.abs(a - bgA) > tolerance) return true;

  // Color difference
  return (
    Math.abs(r - bgR) > tolerance ||
    Math.abs(g - bgG) > tolerance ||
    Math.abs(b - bgB) > tolerance
  );
}

/**
 * Samples the background color from the four corners of the image.
 * Returns the most common corner color as [r, g, b, a].
 */
function detectBackgroundColor(
  data: Uint8ClampedArray,
  width: number,
  height: number
): [number, number, number, number] {
  const corners = [
    0, // top-left
    (width - 1) * 4, // top-right
    (height - 1) * width * 4, // bottom-left
    ((height - 1) * width + (width - 1)) * 4, // bottom-right
  ];

  // Sample a small region around each corner for robustness
  const samples: [number, number, number, number][] = [];
  const sampleSize = Math.min(5, Math.floor(width / 4), Math.floor(height / 4));

  for (const corner of corners) {
    const row = Math.floor(corner / 4 / width);
    const col = (corner / 4) % width;

    let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
    for (let dy = 0; dy < sampleSize; dy++) {
      for (let dx = 0; dx < sampleSize; dx++) {
        const sr = row + (corner === corners[2] || corner === corners[3] ? -dy : dy);
        const sc = col + (corner === corners[1] || corner === corners[3] ? -dx : dx);
        if (sr < 0 || sr >= height || sc < 0 || sc >= width) continue;
        const idx = (sr * width + sc) * 4;
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        aSum += data[idx + 3];
        count++;
      }
    }
    if (count > 0) {
      samples.push([
        Math.round(rSum / count),
        Math.round(gSum / count),
        Math.round(bSum / count),
        Math.round(aSum / count),
      ]);
    }
  }

  // Use the average of all corner samples
  if (samples.length === 0) return [255, 255, 255, 255];

  const avg: [number, number, number, number] = [0, 0, 0, 0];
  for (const s of samples) {
    avg[0] += s[0];
    avg[1] += s[1];
    avg[2] += s[2];
    avg[3] += s[3];
  }
  return [
    Math.round(avg[0] / samples.length),
    Math.round(avg[1] / samples.length),
    Math.round(avg[2] / samples.length),
    Math.round(avg[3] / samples.length),
  ];
}

/**
 * Finds the bounding box of non-background content in image data.
 */
function findContentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number = 30
): { top: number; left: number; bottom: number; right: number } | null {
  const [bgR, bgG, bgB, bgA] = detectBackgroundColor(data, width, height);

  let top = height, left = width, bottom = 0, right = 0;
  let found = false;

  // Scan rows (skip every other row for speed on large images, then refine)
  const step = width * height > 1_000_000 ? 2 : 1;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      if (isContentPixel(data, idx, bgR, bgG, bgB, bgA, tolerance)) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
        found = true;
      }
    }
  }

  // If we used stepping, refine the edges by scanning exact boundary rows/cols
  if (step > 1 && found) {
    // Refine top
    for (let y = Math.max(0, top - step); y <= top; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (isContentPixel(data, idx, bgR, bgG, bgB, bgA, tolerance)) {
          if (y < top) top = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    // Refine bottom
    for (let y = bottom; y <= Math.min(height - 1, bottom + step); y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (isContentPixel(data, idx, bgR, bgG, bgB, bgA, tolerance)) {
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    // Refine left
    for (let x = Math.max(0, left - step); x <= left; x++) {
      for (let y = top; y <= bottom; y++) {
        const idx = (y * width + x) * 4;
        if (isContentPixel(data, idx, bgR, bgG, bgB, bgA, tolerance)) {
          if (x < left) left = x;
        }
      }
    }
    // Refine right
    for (let x = right; x <= Math.min(width - 1, right + step); x++) {
      for (let y = top; y <= bottom; y++) {
        const idx = (y * width + x) * 4;
        if (isContentPixel(data, idx, bgR, bgG, bgB, bgA, tolerance)) {
          if (x > right) right = x;
        }
      }
    }
  }

  if (!found) return null;

  return { top, left, bottom, right };
}

/**
 * Auto-crops a File/Blob image, removing uniform background edges.
 * Returns a new Blob with the cropped image, or the original if no crop needed.
 */
export async function autoCropImage(
  file: File | Blob,
  options: { tolerance?: number; minCropPercent?: number; outputType?: string } = {}
): Promise<Blob> {
  const { tolerance = 30, minCropPercent = 5, outputType } = options;

  const url = URL.createObjectURL(file);

  try {
    const img = await loadImage(url);
    const { width, height } = img;

    // Skip tiny images
    if (width < 20 || height < 20) return file;

    // Draw to canvas
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);

    const bounds = findContentBounds(imageData.data, width, height, tolerance);
    if (!bounds) return file;

    // Add padding
    const cropTop = Math.max(0, bounds.top - PADDING);
    const cropLeft = Math.max(0, bounds.left - PADDING);
    const cropBottom = Math.min(height - 1, bounds.bottom + PADDING);
    const cropRight = Math.min(width - 1, bounds.right + PADDING);

    const cropW = cropRight - cropLeft + 1;
    const cropH = cropBottom - cropTop + 1;

    // Only crop if we're removing at least minCropPercent% of pixels
    const originalArea = width * height;
    const croppedArea = cropW * cropH;
    const removedPercent = ((originalArea - croppedArea) / originalArea) * 100;

    if (removedPercent < minCropPercent) return file;

    // Create cropped canvas
    const outCanvas = document.createElement("canvas");
    outCanvas.width = cropW;
    outCanvas.height = cropH;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) return file;

    outCtx.drawImage(img, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);

    // Convert to blob
    const mimeType = outputType || file.type || "image/png";
    const quality = mimeType === "image/jpeg" ? 0.92 : undefined;

    return new Promise<Blob>((resolve) => {
      outCanvas.toBlob(
        (blob) => resolve(blob || file),
        mimeType,
        quality
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
