/**
 * Robust document edge detection.
 *
 * Pure-TypeScript implementation (no DOM, no OpenCV) so it can run in the
 * browser AND be regression-tested headlessly.
 *
 * Pipeline
 *  1. grayscale + Gaussian blur
 *  2. CLAHE (local contrast enhancement) — handles shadows / uneven light
 *  3. PASS A: adaptive Canny-style gradient mask -> morphological close ->
 *             connected components -> convex hull -> quad candidates
 *  4. PASS B: adaptive threshold (both polarities) + Otsu segmentation ->
 *             connected components -> convex hull -> quad candidates
 *  5. Every candidate is SCORED (never "largest contour wins") on area,
 *     rectangularity, convexity, per-side edge strength, opposite-side
 *     consistency, aspect ratio, centering and document-vs-background
 *     separation (interior uniformity vs. patterned surroundings).
 *  6. Highest scoring candidate across both passes wins.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

export interface CandidateDebug {
  pass: 'A' | 'B';
  score: number;
  areaRatio: number;
  edgeScore: number;
  rectScore: number;
  aspect: number;
  separation: number;
  corners: [number, number][];
}

export interface DetectionDebug {
  detectWidth: number;
  detectHeight: number;
  contoursPassA: number;
  contoursPassB: number;
  candidates: number;
  top: CandidateDebug[];
}

export interface DetectionResult {
  bounds: Quad;
  score: number;
  confidence: number;
  debug: DetectionDebug;
}

/** Minimum score for a candidate to be considered a reliable document. */
export const RELIABLE_SCORE = 0.5;

const DETECT_MAX_DIM = 520;
const MAX_COMPONENTS_PER_MASK = 14;
const MAX_HULL_POINTS = 18;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

// ───────────────────────── image helpers ─────────────────────────

function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
  }
  return out;
}

/** Nearest-neighbour downscale of an RGBA buffer (aspect preserved by caller). */
function resizeRGBA(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  nw: number,
  nh: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(nw * nh * 4);
  const sx = w / nw;
  const sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const srcY = Math.min(h - 1, Math.floor(y * sy));
    for (let x = 0; x < nw; x++) {
      const srcX = Math.min(w - 1, Math.floor(x * sx));
      const si = (srcY * w + srcX) * 4;
      const di = (y * nw + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = 255;
    }
  }
  return out;
}

function gaussianBlur(src: Float32Array, w: number, h: number): Float32Array {
  // separable 5-tap gaussian (sigma ~1.1)
  const k = [1, 4, 6, 4, 1];
  const kSum = 16;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        s += src[y * w + xx] * k[i + 2];
      }
      tmp[y * w + x] = s / kSum;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        s += tmp[yy * w + x] * k[i + 2];
      }
      out[y * w + x] = s / kSum;
    }
  }
  return out;
}

/** CLAHE-ish: tiled histogram equalisation with clipping + bilinear blending. */
function clahe(src: Float32Array, w: number, h: number, tiles = 8, clipLimit = 3): Float32Array {
  const tw = Math.ceil(w / tiles);
  const th = Math.ceil(h / tiles);
  const luts: Uint8Array[][] = [];
  for (let ty = 0; ty < tiles; ty++) {
    luts[ty] = [];
    for (let tx = 0; tx < tiles; tx++) {
      const hist = new Float32Array(256);
      let count = 0;
      const y0 = ty * th;
      const x0 = tx * tw;
      for (let y = y0; y < Math.min(h, y0 + th); y++) {
        for (let x = x0; x < Math.min(w, x0 + tw); x++) {
          hist[Math.max(0, Math.min(255, src[y * w + x] | 0))]++;
          count++;
        }
      }
      if (count === 0) {
        luts[ty][tx] = new Uint8Array(256).map((_, i) => i);
        continue;
      }
      // clip
      const limit = (clipLimit * count) / 256;
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) {
          excess += hist[i] - limit;
          hist[i] = limit;
        }
      }
      const inc = excess / 256;
      const lut = new Uint8Array(256);
      let cum = 0;
      for (let i = 0; i < 256; i++) {
        cum += hist[i] + inc;
        lut[i] = Math.max(0, Math.min(255, Math.round((cum / count) * 255)));
      }
      luts[ty][tx] = lut;
    }
  }

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / th - 0.5;
    const ty0 = Math.max(0, Math.min(tiles - 1, Math.floor(fy)));
    const ty1 = Math.max(0, Math.min(tiles - 1, ty0 + 1));
    const wy = Math.max(0, Math.min(1, fy - ty0));
    for (let x = 0; x < w; x++) {
      const fx = x / tw - 0.5;
      const tx0 = Math.max(0, Math.min(tiles - 1, Math.floor(fx)));
      const tx1 = Math.max(0, Math.min(tiles - 1, tx0 + 1));
      const wx = Math.max(0, Math.min(1, fx - tx0));
      const v = Math.max(0, Math.min(255, src[y * w + x] | 0));
      const a = luts[ty0][tx0][v];
      const b = luts[ty0][tx1][v];
      const c = luts[ty1][tx0][v];
      const d = luts[ty1][tx1][v];
      out[y * w + x] =
        a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) + c * (1 - wx) * wy + d * wx * wy;
    }
  }
  return out;
}

function sobelMagnitude(src: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -src[i - w - 1] + src[i - w + 1] - 2 * src[i - 1] + 2 * src[i + 1] - src[i + w - 1] + src[i + w + 1];
      const gy =
        -src[i - w - 1] - 2 * src[i - w] - src[i - w + 1] + src[i + w - 1] + 2 * src[i + w] + src[i + w + 1];
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

function percentile(values: Float32Array, p: number): number {
  const arr = Array.from(values).sort((a, b) => a - b);
  return arr[Math.max(0, Math.min(arr.length - 1, Math.floor(arr.length * p)))];
}

function integralImage(src: Float32Array, w: number, h: number): Float64Array {
  const ii = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      ii[(y + 1) * (w + 1) + (x + 1)] = ii[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  return ii;
}

function boxMean(ii: Float64Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  const W = w + 1;
  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  const s =
    ii[(y1 + 1) * W + (x1 + 1)] - ii[y0 * W + (x1 + 1)] - ii[(y1 + 1) * W + x0] + ii[y0 * W + x0];
  return s / area;
}

/** Morphological close (dilate then erode) on a binary mask. */
function morphClose(mask: Uint8Array, w: number, h: number, r = 2): Uint8Array {
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -r; dy <= r && !v; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (mask[yy * w + xx]) {
            v = 1;
            break;
          }
        }
      }
      dil[y * w + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let dy = -r; dy <= r && v; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          if (!dil[yy * w + xx]) {
            v = 0;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

// ───────────────────────── contours ─────────────────────────

interface Component {
  points: Point[]; // boundary-ish sample of component pixels
  area: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Connected components (4-neighbour) of a binary mask, biggest first. */
function connectedComponents(mask: Uint8Array, w: number, h: number, minArea: number): Component[] {
  const labels = new Int32Array(w * h).fill(-1);
  const comps: Component[] = [];
  const stack = new Int32Array(w * h);

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = comps.length;
    let area = 0;
    let x0 = w,
      y0 = h,
      x1 = 0,
      y1 = 0;
    const pixels: number[] = [];
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % w;
      const y = (idx - x) / w;
      area++;
      pixels.push(idx);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && mask[idx - 1] && labels[idx - 1] === -1) {
        labels[idx - 1] = comps.length;
        stack[sp++] = idx - 1;
      }
      if (x < w - 1 && mask[idx + 1] && labels[idx + 1] === -1) {
        labels[idx + 1] = comps.length;
        stack[sp++] = idx + 1;
      }
      if (y > 0 && mask[idx - w] && labels[idx - w] === -1) {
        labels[idx - w] = comps.length;
        stack[sp++] = idx - w;
      }
      if (y < h - 1 && mask[idx + w] && labels[idx + w] === -1) {
        labels[idx + w] = comps.length;
        stack[sp++] = idx + w;
      }
    }
    if (area < minArea) {
      comps.push({ points: [], area: 0, bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } });
      continue;
    }
    // subsample points to keep hull computation cheap
    const step = Math.max(1, Math.floor(pixels.length / 4000));
    const points: Point[] = [];
    for (let i = 0; i < pixels.length; i += step) {
      const idx = pixels[i];
      const x = idx % w;
      points.push({ x, y: (idx - x) / w });
    }
    comps.push({ points, area, bbox: { x0, y0, x1, y1 } });
  }

  return comps
    .filter((c) => c.points.length >= 8)
    .sort((a, b) => b.area - a.area)
    .slice(0, MAX_COMPONENTS_PER_MASK);
}

function convexHull(points: Point[]): Point[] {
  if (points.length < 4) return points.slice();
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Douglas–Peucker simplification of a closed polygon (approxPolyDP). */
function approxPolyDP(poly: Point[], epsilon: number): Point[] {
  if (poly.length <= 4) return poly.slice();
  const dist = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
  };
  const simplify = (pts: Point[]): Point[] => {
    if (pts.length < 3) return pts;
    let maxD = 0;
    let idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD <= epsilon) return [pts[0], pts[pts.length - 1]];
    return simplify(pts.slice(0, idx + 1)).slice(0, -1).concat(simplify(pts.slice(idx)));
  };
  const closed = poly.concat([poly[0]]);
  const out = simplify(closed);
  out.pop();
  return out;
}

function polyArea(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Reduce a convex hull to the maximum-area inscribed quadrilateral.
 * (Equivalent intent to approxPolyDP == 4 corners, but stable on noisy hulls.)
 */
function hullToQuad(hull: Point[]): Point[] | null {
  if (hull.length < 4) return null;
  let pts = hull;
  if (pts.length > MAX_HULL_POINTS) {
    const step = pts.length / MAX_HULL_POINTS;
    const sampled: Point[] = [];
    for (let i = 0; i < MAX_HULL_POINTS; i++) sampled.push(pts[Math.floor(i * step)]);
    pts = sampled;
  }
  const n = pts.length;
  let best: Point[] | null = null;
  let bestArea = 0;
  for (let i = 0; i < n - 3; i++) {
    for (let j = i + 1; j < n - 2; j++) {
      for (let k = j + 1; k < n - 1; k++) {
        for (let l = k + 1; l < n; l++) {
          const quad = [pts[i], pts[j], pts[k], pts[l]];
          const a = polyArea(quad);
          if (a > bestArea) {
            bestArea = a;
            best = quad;
          }
        }
      }
    }
  }
  return best;
}

// ───────────────────────── corner handling ─────────────────────────

export function orderCorners(pts: Point[]): Quad | null {
  if (pts.length !== 4) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  // sort counter-clockwise-free: by angle around centroid (clockwise from -135°)
  const sorted = pts
    .map((p) => ({ p, a: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((u, v) => u.a - v.a)
    .map((o) => o.p);
  // sorted starts somewhere; rotate so the first point is the top-left-most
  let startIdx = 0;
  let bestSum = Infinity;
  sorted.forEach((p, i) => {
    const s = p.x + p.y;
    if (s < bestSum) {
      bestSum = s;
      startIdx = i;
    }
  });
  const ring = [
    sorted[startIdx % 4],
    sorted[(startIdx + 1) % 4],
    sorted[(startIdx + 2) % 4],
    sorted[(startIdx + 3) % 4],
  ];
  const quad: Quad = {
    topLeft: ring[0],
    topRight: ring[1],
    bottomRight: ring[2],
    bottomLeft: ring[3],
  };
  // duplicate-point guard
  const list = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y) < 4) return null;
    }
  }
  // convexity / self-intersection guard
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = list[i];
    const b = list[(i + 1) % 4];
    const c = list[(i + 2) % 4];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cr === 0) return null;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return null;
  }
  return quad;
}

// ───────────────────────── scoring ─────────────────────────

interface ScoreCtx {
  w: number;
  h: number;
  mag: Float32Array;
  magNorm: number;
  gray: Float32Array;
}

function sampleEdgeStrength(ctx: ScoreCtx, a: Point, b: Point): number {
  const { w, h, mag, magNorm } = ctx;
  const steps = 24;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let sum = 0;
  let count = 0;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    let localMax = 0;
    for (let o = -2; o <= 2; o++) {
      const x = Math.round(px + nx * o);
      const y = Math.round(py + ny * o);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const v = mag[y * w + x];
      if (v > localMax) localMax = v;
    }
    sum += Math.min(1, localMax / magNorm);
    count++;
  }
  return count ? sum / count : 0;
}

function ringStats(ctx: ScoreCtx, quad: Quad, scale: number): { mean: number; std: number } {
  const { w, h, gray } = ctx;
  const cx = (quad.topLeft.x + quad.topRight.x + quad.bottomLeft.x + quad.bottomRight.x) / 4;
  const cy = (quad.topLeft.y + quad.topRight.y + quad.bottomLeft.y + quad.bottomRight.y) / 4;
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const samples: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    for (let s = 0; s <= 20; s++) {
      const t = s / 20;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      const x = Math.round(cx + (px - cx) * scale);
      const y = Math.round(cy + (py - cy) * scale);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      samples.push(gray[y * w + x]);
    }
  }
  if (!samples.length) return { mean: 0, std: 0 };
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  const varr = samples.reduce((s, v) => s + (v - mean) * (v - mean), 0) / samples.length;
  return { mean, std: Math.sqrt(varr) };
}

function scoreQuad(ctx: ScoreCtx, quad: Quad): Omit<CandidateDebug, 'pass' | 'corners'> | null {
  const { w, h } = ctx;
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const area = polyArea(pts);
  const imgArea = w * h;
  const areaRatio = area / imgArea;
  if (areaRatio < 0.05 || areaRatio > 0.97) return null;

  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw < w * 0.18 || bh < h * 0.12) return null;

  // rectangularity: quad fills its bbox + corner angles near 90°
  const fill = area / Math.max(1, bw * bh);
  if (fill < 0.55) return null;
  let angleDev = 0;
  for (let i = 0; i < 4; i++) {
    const p0 = pts[(i + 3) % 4];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % 4];
    const v1 = { x: p0.x - p1.x, y: p0.y - p1.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const cos =
      (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) || 1) * (Math.hypot(v2.x, v2.y) || 1));
    const ang = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    angleDev += Math.abs(90 - ang);
  }
  angleDev /= 4;
  if (angleDev > 28) return null;
  const rectScore = clamp01(fill * 0.5 + (1 - angleDev / 28) * 0.5);

  // opposite side consistency
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const top = d(quad.topLeft, quad.topRight);
  const bottom = d(quad.bottomLeft, quad.bottomRight);
  const left = d(quad.topLeft, quad.bottomLeft);
  const right = d(quad.topRight, quad.bottomRight);
  const consistency =
    (Math.min(top, bottom) / Math.max(top, bottom) + Math.min(left, right) / Math.max(left, right)) / 2;
  if (consistency < 0.6) return null;

  // aspect ratio (cards ~1.58, A4 ~1.41, receipts up to ~3)
  const longSide = Math.max((top + bottom) / 2, (left + right) / 2);
  const shortSide = Math.min((top + bottom) / 2, (left + right) / 2);
  const aspect = longSide / Math.max(1, shortSide);
  let aspectScore: number;
  if (aspect >= 1.2 && aspect <= 1.75) aspectScore = 1;
  else if (aspect < 1.2) aspectScore = clamp01(1 - (1.2 - aspect) / 0.35);
  else aspectScore = clamp01(1 - (aspect - 1.75) / 1.5);

  // edge strength along all four sides
  const sides = [
    sampleEdgeStrength(ctx, quad.topLeft, quad.topRight),
    sampleEdgeStrength(ctx, quad.topRight, quad.bottomRight),
    sampleEdgeStrength(ctx, quad.bottomRight, quad.bottomLeft),
    sampleEdgeStrength(ctx, quad.bottomLeft, quad.topLeft),
  ];
  const avgEdge = sides.reduce((s, v) => s + v, 0) / 4;
  const minEdge = Math.min(...sides);
  const edgeScore = clamp01(avgEdge * 0.6 + minEdge * 0.4);
  if (minEdge < 0.10) return null;

  // area preference (documents usually occupy a decent part of the frame)
  const areaScore =
    areaRatio < 0.12 ? clamp01(areaRatio / 0.12) : areaRatio > 0.9 ? clamp01((0.97 - areaRatio) / 0.07) : 1;

  // centering (users aim at the document)
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const centerScore = clamp01(
    1 - Math.hypot(cx - w / 2, cy - h / 2) / (Math.hypot(w, h) * 0.35)
  );

  // document vs. patterned background separation
  const inner = ringStats(ctx, quad, 0.82);
  const outer = ringStats(ctx, quad, 1.12);
  const brightness = clamp01(Math.abs(inner.mean - outer.mean) / 45);
  const texture = clamp01((outer.std - inner.std) / 30 + 0.35);
  const uniformity = clamp01(1 - inner.std / 90);
  const separation = clamp01(brightness * 0.4 + texture * 0.35 + uniformity * 0.25);

  const score = clamp01(
    edgeScore * 0.3 +
      rectScore * 0.15 +
      consistency * 0.1 +
      aspectScore * 0.1 +
      areaScore * 0.08 +
      centerScore * 0.07 +
      separation * 0.2
  );

  return { score, areaRatio, edgeScore, rectScore, aspect, separation };
}

// ───────────────────────── main detection ─────────────────────────

function candidatesFromMask(
  mask: Uint8Array,
  w: number,
  h: number,
  ctx: ScoreCtx,
  pass: 'A' | 'B'
): { quad: Quad; dbg: CandidateDebug }[] {
  const comps = connectedComponents(mask, w, h, w * h * 0.008);
  const out: { quad: Quad; dbg: CandidateDebug }[] = [];
  for (const comp of comps) {
    const hull = convexHull(comp.points);
    if (hull.length < 4) continue;
    const perim = hull.reduce(
      (s, p, i) => s + Math.hypot(p.x - hull[(i + 1) % hull.length].x, p.y - hull[(i + 1) % hull.length].y),
      0
    );
    for (const eps of [0.02, 0.04]) {
      const approx = approxPolyDP(hull, perim * eps);
      const quadPts = approx.length === 4 ? approx : hullToQuad(approx.length >= 4 ? approx : hull);
      if (!quadPts) continue;
      const quad = orderCorners(quadPts);
      if (!quad) continue;
      const s = scoreQuad(ctx, quad);
      if (!s) continue;
      out.push({
        quad,
        dbg: {
          pass,
          corners: [
            [Math.round(quad.topLeft.x), Math.round(quad.topLeft.y)],
            [Math.round(quad.topRight.x), Math.round(quad.topRight.y)],
            [Math.round(quad.bottomRight.x), Math.round(quad.bottomRight.y)],
            [Math.round(quad.bottomLeft.x), Math.round(quad.bottomLeft.y)],
          ],
          ...s,
        },
      });
    }
  }
  return out;
}

export interface DetectOptions {
  debug?: boolean;
}

/**
 * Detect the document quadrilateral in an RGBA buffer.
 * Returned coordinates are in the SOURCE image coordinate space.
 */
export function detectDocumentQuad(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: DetectOptions = {}
): DetectionResult | null {
  // 2. resized processing copy, aspect preserved, scale factor kept
  const scale = Math.min(1, DETECT_MAX_DIM / Math.max(width, height));
  const w = Math.max(32, Math.round(width * scale));
  const h = Math.max(32, Math.round(height * scale));
  const small = scale < 1 ? resizeRGBA(rgba, width, height, w, h) : rgba;

  // 3. preprocessing
  const gray = toGray(small, w, h);
  const blurred = gaussianBlur(gray, w, h);
  const enhanced = clahe(blurred, w, h);
  const mag = sobelMagnitude(blurred, w, h);
  const magHigh = Math.max(28, percentile(mag, 0.93));
  const ctx: ScoreCtx = { w, h, mag, magNorm: magHigh, gray: blurred };

  // PASS A — adaptive Canny-ish gradient mask + morphological close
  const low = magHigh * 0.45;
  const strong = new Uint8Array(w * h);
  const weak = new Uint8Array(w * h);
  for (let i = 0; i < mag.length; i++) {
    if (mag[i] >= magHigh) strong[i] = 1;
    else if (mag[i] >= low) weak[i] = 1;
  }
  // hysteresis: keep weak pixels adjacent to strong ones
  const edges = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (strong[i]) {
        edges[i] = 1;
        continue;
      }
      if (!weak[i]) continue;
      for (let dy = -1; dy <= 1 && !edges[i]; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (strong[i + dy * w + dx]) {
            edges[i] = 1;
            break;
          }
    }
  }
  const maskA = morphClose(edges, w, h, 2);
  const candA = candidatesFromMask(maskA, w, h, ctx, 'A');

  // PASS B — adaptive threshold (both polarities) + global Otsu segmentation
  const ii = integralImage(enhanced, w, h);
  const block = Math.max(9, Math.round(Math.min(w, h) / 6));
  const C = 6;
  const bright = new Uint8Array(w * h);
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - block);
    const y1 = Math.min(h - 1, y + block);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - block);
      const x1 = Math.min(w - 1, x + block);
      const m = boxMean(ii, w, x0, y0, x1, y1);
      const v = enhanced[y * w + x];
      if (v > m + C) bright[y * w + x] = 1;
      if (v < m - C) dark[y * w + x] = 1;
    }
  }
  // Otsu on the (non-CLAHE) blurred gray — documents are usually brighter
  const hist = new Float64Array(256);
  for (let i = 0; i < blurred.length; i++) hist[Math.max(0, Math.min(255, blurred[i] | 0))]++;
  const total = blurred.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0,
    sumB = 0,
    bestVar = -1,
    otsu = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > bestVar) {
      bestVar = varBetween;
      otsu = t;
    }
  }
  const otsuBright = new Uint8Array(w * h);
  const otsuDark = new Uint8Array(w * h);
  for (let i = 0; i < blurred.length; i++) {
    if (blurred[i] > otsu) otsuBright[i] = 1;
    else otsuDark[i] = 1;
  }

  const candB: { quad: Quad; dbg: CandidateDebug }[] = [];
  for (const m of [bright, dark, otsuBright, otsuDark]) {
    candB.push(...candidatesFromMask(morphClose(m, w, h, 2), w, h, ctx, 'B'));
  }

  const all = [...candA, ...candB].sort((a, b) => b.dbg.score - a.dbg.score);

  const debug: DetectionDebug = {
    detectWidth: w,
    detectHeight: h,
    contoursPassA: candA.length,
    contoursPassB: candB.length,
    candidates: all.length,
    top: all.slice(0, 5).map((c) => c.dbg),
  };

  if (options.debug && typeof console !== 'undefined') {
    console.debug('[edge-detect]', JSON.stringify(debug, null, 2));
  }

  if (!all.length) return null;

  const best = all[0];
  const inv = 1 / (scale || 1);
  const map = (p: Point): Point => ({
    x: Math.max(0, Math.min(width, p.x * inv)),
    y: Math.max(0, Math.min(height, p.y * inv)),
  });

  return {
    bounds: {
      topLeft: map(best.quad.topLeft),
      topRight: map(best.quad.topRight),
      bottomRight: map(best.quad.bottomRight),
      bottomLeft: map(best.quad.bottomLeft),
    },
    score: best.dbg.score,
    confidence: best.dbg.score,
    debug,
  };
}

/** Sensible centered fallback crop (80% of the frame). */
export function centeredFallbackQuad(width: number, height: number): Quad {
  const mx = width * 0.1;
  const my = height * 0.1;
  return {
    topLeft: { x: mx, y: my },
    topRight: { x: width - mx, y: my },
    bottomRight: { x: width - mx, y: height - my },
    bottomLeft: { x: mx, y: height - my },
  };
}
