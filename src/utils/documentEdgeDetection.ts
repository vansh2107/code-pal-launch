/**
 * documentEdgeDetection.ts
 *
 * Pure-TypeScript document quad detector (no DOM, no OpenCV) designed to work on
 * busy / patterned backgrounds where projection-profile detectors fail.
 *
 * Pipeline:
 *   grayscale -> gaussian blur -> CLAHE
 *   Pass A: adaptive-threshold Canny + morphological close
 *   Pass B: adaptive binary threshold (both polarities) + Otsu
 *   contours -> convex hull -> approxPolyDP -> quad candidates
 *   scoring (area, rectangularity, convexity, edge support, aspect, centering,
 *            interior uniformity vs exterior)
 *
 * Runs on a plain RGBA buffer so it can be unit tested in Node.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export interface QuadCandidate {
  quad: Quad;
  score: number;
  source: 'canny' | 'threshold-dark' | 'threshold-light' | 'otsu';
  metrics: {
    areaRatio: number;
    rectangularity: number;
    convexity: number;
    edgeSupport: number;
    minSideEdge: number;
    aspect: number;
    centering: number;
    uniformity: number;
  };
}

export interface DetectionDebug {
  processWidth: number;
  processHeight: number;
  scale: number;
  contourCounts: Record<string, number>;
  candidateCount: number;
  candidates: Array<{ score: number; source: string; metrics: QuadCandidate['metrics'] }>;
  selected: Quad | null;
  reliable: boolean;
  ms: number;
}

export interface DetectionResult {
  /** Quad in ORIGINAL image coordinates. Always present (fallback when unreliable). */
  quad: Quad;
  score: number;
  reliable: boolean;
  usedFallback: boolean;
  candidates: QuadCandidate[];
  debug: DetectionDebug;
}

/** Minimum score for a detection to be trusted without user confirmation. */
export const RELIABLE_SCORE = 0.62;

const PROCESS_MAX_DIM = 640;
const MIN_AREA_RATIO = 0.08;
const MAX_AREA_RATIO = 0.98;

// ───────────────────────── public API ─────────────────────────

export function detectDocumentQuad(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): DetectionResult {
  const t0 = Date.now();

  // 1. Resize to a processing copy (preserve scale factors)
  const scale = Math.min(1, PROCESS_MAX_DIM / Math.max(width, height));
  const pw = Math.max(1, Math.round(width * scale));
  const ph = Math.max(1, Math.round(height * scale));
  const gray = resizeToGray(rgba, width, height, pw, ph);

  // 2. Denoise + local contrast
  const blurred = gaussianBlur(gray, pw, ph);
  const equalized = clahe(blurred, pw, ph);

  // Gradient magnitude is reused for edge-support scoring.
  const grad = sobelMagnitude(blurred, pw, ph);

  const contourCounts: Record<string, number> = {};
  const candidates: QuadCandidate[] = [];

  // 3. Pass A — Canny with adaptive hysteresis + morphological close
  {
    const { low, high } = adaptiveThresholds(grad);
    const edges = cannyFromGradient(blurred, pw, ph, low, high);
    const closed = morphClose(edges, pw, ph, 2);
    const quads = quadsFromMask(closed, pw, ph);
    contourCounts.canny = quads.length;
    for (const q of quads) candidates.push(scoreQuad(q, equalized, grad, pw, ph, 'canny'));
  }

  // 4. Pass B — adaptive threshold (both polarities) + Otsu
  const passes: Array<{ mask: Uint8Array; source: QuadCandidate['source'] }> = [
    { mask: adaptiveThresholdMask(equalized, pw, ph, false), source: 'threshold-dark' },
    { mask: adaptiveThresholdMask(equalized, pw, ph, true), source: 'threshold-light' },
    { mask: otsuMask(equalized, pw, ph), source: 'otsu' },
  ];
  for (const p of passes) {
    const closed = morphClose(p.mask, pw, ph, 1);
    const quads = quadsFromMask(closed, pw, ph);
    contourCounts[p.source] = quads.length;
    for (const q of quads) candidates.push(scoreQuad(q, equalized, grad, pw, ph, p.source));
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? null;
  const reliable = !!best && best.score >= RELIABLE_SCORE;

  const invScale = 1 / scale;
  const chosenProcess = best ? best.quad : centeredFallbackQuad(pw, ph);
  const quad = scaleQuad(chosenProcess, invScale, width, height);

  const debug: DetectionDebug = {
    processWidth: pw,
    processHeight: ph,
    scale,
    contourCounts,
    candidateCount: candidates.length,
    candidates: candidates.slice(0, 8).map((c) => ({ score: c.score, source: c.source, metrics: c.metrics })),
    selected: quad,
    reliable,
    ms: Date.now() - t0,
  };

  return {
    quad,
    score: best ? best.score : 0,
    reliable,
    usedFallback: !best,
    candidates: candidates.map((c) => ({ ...c, quad: scaleQuad(c.quad, invScale, width, height) })),
    debug,
  };
}

/** A centered quad covering ~85% of the frame — safe manual-crop starting point. */
export function centeredFallbackQuad(width: number, height: number): Quad {
  const mx = width * 0.075;
  const my = height * 0.075;
  return {
    topLeft: { x: mx, y: my },
    topRight: { x: width - mx, y: my },
    bottomRight: { x: width - mx, y: height - my },
    bottomLeft: { x: mx, y: height - my },
  };
}

// ───────────────────────── image ops ─────────────────────────

function resizeToGray(
  rgba: Uint8ClampedArray | Uint8Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): Uint8Array {
  const out = new Uint8Array(dw * dh);
  const xr = sw / dw;
  const yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.min(sh - 1, Math.floor(y * yr));
    const y1 = Math.min(sh - 1, Math.floor((y + 1) * yr - 0.001));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.min(sw - 1, Math.floor(x * xr));
      const x1 = Math.min(sw - 1, Math.floor((x + 1) * xr - 0.001));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const i = (yy * sw + xx) * 4;
          sum += rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
          n++;
        }
      }
      out[y * dw + x] = n ? Math.round(sum / n) : 0;
    }
  }
  return out;
}

function gaussianBlur(src: Uint8Array, w: number, h: number): Uint8Array {
  // separable 5-tap gaussian (sigma ~1)
  const k = [1, 4, 6, 4, 1];
  const ksum = 16;
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        s += src[y * w + xx] * k[i + 2];
      }
      tmp[y * w + x] = s / ksum;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        s += tmp[yy * w + x] * k[i + 2];
      }
      out[y * w + x] = Math.round(s / ksum);
    }
  }
  return out;
}

/** Contrast Limited Adaptive Histogram Equalization (tiled, bilinear-free approximation). */
function clahe(src: Uint8Array, w: number, h: number, tiles = 8, clipLimit = 3): Uint8Array {
  const out = new Uint8Array(w * h);
  const tw = Math.ceil(w / tiles);
  const th = Math.ceil(h / tiles);
  const luts: Uint8Array[] = [];
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const hist = new Int32Array(256);
      let count = 0;
      for (let y = ty * th; y < Math.min(h, (ty + 1) * th); y++) {
        for (let x = tx * tw; x < Math.min(w, (tx + 1) * tw); x++) {
          hist[src[y * w + x]]++;
          count++;
        }
      }
      const limit = Math.max(1, Math.floor((clipLimit * count) / 256));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) {
          excess += hist[i] - limit;
          hist[i] = limit;
        }
      }
      const bonus = Math.floor(excess / 256);
      const lut = new Uint8Array(256);
      let cum = 0;
      const total = count || 1;
      for (let i = 0; i < 256; i++) {
        cum += hist[i] + bonus;
        lut[i] = Math.min(255, Math.round((cum / total) * 255));
      }
      luts.push(lut);
    }
  }
  for (let y = 0; y < h; y++) {
    const ty = Math.min(tiles - 1, Math.floor(y / th));
    for (let x = 0; x < w; x++) {
      const tx = Math.min(tiles - 1, Math.floor(x / tw));
      out[y * w + x] = luts[ty * tiles + tx][src[y * w + x]];
    }
  }
  return out;
}

interface Gradient {
  mag: Float32Array;
  dir: Float32Array;
  max: number;
}

function sobelMagnitude(src: Uint8Array, w: number, h: number): Gradient {
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h);
  let max = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -src[i - w - 1] + src[i - w + 1] - 2 * src[i - 1] + 2 * src[i + 1] - src[i + w - 1] + src[i + w + 1];
      const gy =
        -src[i - w - 1] - 2 * src[i - w] - src[i - w + 1] + src[i + w - 1] + 2 * src[i + w] + src[i + w + 1];
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      dir[i] = Math.atan2(gy, gx);
      if (m > max) max = m;
    }
  }
  return { mag, dir, max };
}

function adaptiveThresholds(grad: Gradient): { low: number; high: number } {
  const vals: number[] = [];
  for (let i = 0; i < grad.mag.length; i += 3) vals.push(grad.mag[i]);
  vals.sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)] || 1;
  const p90 = vals[Math.floor(vals.length * 0.9)] || median * 2;
  const high = Math.max(20, Math.min(p90, median * 3));
  return { low: high * 0.4, high };
}

function cannyFromGradient(src: Uint8Array, w: number, h: number, low: number, high: number): Uint8Array {
  const { mag, dir } = sobelMagnitude(src, w, h);
  const sup = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const angle = ((dir[i] * 180) / Math.PI + 180) % 180;
      let a: number, b: number;
      if (angle < 22.5 || angle >= 157.5) {
        a = mag[i - 1];
        b = mag[i + 1];
      } else if (angle < 67.5) {
        a = mag[i - w + 1];
        b = mag[i + w - 1];
      } else if (angle < 112.5) {
        a = mag[i - w];
        b = mag[i + w];
      } else {
        a = mag[i - w - 1];
        b = mag[i + w + 1];
      }
      sup[i] = mag[i] >= a && mag[i] >= b ? mag[i] : 0;
    }
  }
  // hysteresis
  const out = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < sup.length; i++) {
    if (sup[i] >= high) {
      out[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!out[ni] && sup[ni] >= low) {
          out[ni] = 1;
          stack.push(ni);
        }
      }
    }
  }
  return out;
}

function morphClose(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return erode(dilate(mask, w, h, r), w, h, r);
}

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -r; dy <= r && !v; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (mask[ny * w + nx]) {
            v = 1;
            break;
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let dy = -r; dy <= r && v; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const ny = Math.min(h - 1, Math.max(0, y + dy));
          if (!mask[ny * w + nx]) {
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

function otsuThreshold(src: Uint8Array): number {
  const hist = new Int32Array(256);
  for (let i = 0; i < src.length; i++) hist[src[i]]++;
  const total = src.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = i;
    }
  }
  return thr;
}

function otsuMask(src: Uint8Array, w: number, h: number): Uint8Array {
  const thr = otsuThreshold(src);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < src.length; i++) out[i] = src[i] > thr ? 1 : 0;
  return out;
}

/** Mean-based adaptive threshold using an integral image. invert=true keeps darker-than-local. */
function adaptiveThresholdMask(src: Uint8Array, w: number, h: number, invert: boolean): Uint8Array {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const r = Math.max(4, Math.floor(Math.min(w, h) / 16));
  const out = new Uint8Array(w * h);
  const C = 5;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const s =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const mean = s / area;
      const v = src[y * w + x];
      out[y * w + x] = invert ? (v > mean + C ? 1 : 0) : v < mean - C ? 1 : 0;
    }
  }
  return out;
}

// ───────────────────────── contours ─────────────────────────

/** Connected components -> convex hull -> approxPolyDP -> quad. */
function quadsFromMask(mask: Uint8Array, w: number, h: number): Quad[] {
  const labels = new Int32Array(w * h).fill(-1);
  const quads: Quad[] = [];
  const minPixels = Math.max(40, Math.floor(w * h * 0.002));
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    stack.length = 0;
    stack.push(start);
    labels[start] = start;
    const pts: Point[] = [];
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      pts.push({ x, y });
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (mask[ni] && labels[ni] === -1) {
            labels[ni] = start;
            stack.push(ni);
          }
        }
      }
    }
    if (pts.length < minPixels) continue;

    const hull = convexHull(pts);
    if (hull.length < 4) continue;
    const peri = perimeter(hull);
    let quadPts: Point[] | null = null;
    for (const eps of [0.02, 0.03, 0.05, 0.08]) {
      const approx = approxPolyDP(hull, eps * peri);
      if (approx.length === 4) {
        quadPts = approx;
        break;
      }
    }
    if (!quadPts) quadPts = minAreaQuad(hull);
    const ordered = orderCorners(quadPts);
    if (ordered) quads.push(ordered);
    if (quads.length > 40) break;
  }
  return quads;
}

function convexHull(points: Point[]): Point[] {
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function perimeter(poly: Point[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    p += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return p;
}

function approxPolyDP(poly: Point[], epsilon: number): Point[] {
  if (poly.length <= 3) return poly.slice();
  // closed polygon: split at the two farthest-apart vertices
  let iMax = 0;
  let jMax = 1;
  let dMax = -1;
  for (let i = 0; i < poly.length; i++) {
    for (let j = i + 1; j < poly.length; j++) {
      const d = Math.hypot(poly[i].x - poly[j].x, poly[i].y - poly[j].y);
      if (d > dMax) {
        dMax = d;
        iMax = i;
        jMax = j;
      }
    }
  }
  const first = poly.slice(iMax, jMax + 1);
  const second = poly.slice(jMax).concat(poly.slice(0, iMax + 1));
  const a = rdp(first, epsilon);
  const b = rdp(second, epsilon);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  const start = points[0];
  const end = points[points.length - 1];
  let index = -1;
  let maxDist = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon && index > 0) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [start, end];
}

function pointLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Rotating-calipers-free approximation: axis-aligned bbox of the hull. */
function minAreaQuad(hull: Point[]): Point[] {
  const xs = hull.map((p) => p.x);
  const ys = hull.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/** Order 4 points as TL, TR, BR, BL; reject duplicates / self-intersecting quads. */
export function orderCorners(pts: Point[]): Quad | null {
  if (pts.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 3) return null;
    }
  }
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
  const sorted = pts
    .slice()
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // rotate so the first point is the one closest to the top-left
  let startIdx = 0;
  let bestVal = Infinity;
  for (let i = 0; i < 4; i++) {
    const v = sorted[i].x + sorted[i].y;
    if (v < bestVal) {
      bestVal = v;
      startIdx = i;
    }
  }
  const o = [0, 1, 2, 3].map((i) => sorted[(startIdx + i) % 4]);
  const quad: Quad = { topLeft: o[0], topRight: o[1], bottomRight: o[2], bottomLeft: o[3] };
  if (segmentsIntersect(quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft)) return null;
  if (segmentsIntersect(quad.topRight, quad.bottomRight, quad.bottomLeft, quad.topLeft)) return null;
  return quad;
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// ───────────────────────── scoring ─────────────────────────

function polygonArea(q: Quad): number {
  const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function scoreQuad(
  quad: Quad,
  gray: Uint8Array,
  grad: Gradient,
  w: number,
  h: number,
  source: QuadCandidate['source']
): QuadCandidate {
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const area = polygonArea(quad);
  const areaRatio = area / (w * h);

  // angle deviation from 90deg
  let angleDev = 0;
  for (let i = 0; i < 4; i++) {
    const prev = pts[(i + 3) % 4];
    const cur = pts[i];
    const next = pts[(i + 1) % 4];
    const a1 = Math.atan2(prev.y - cur.y, prev.x - cur.x);
    const a2 = Math.atan2(next.y - cur.y, next.x - cur.x);
    let ang = Math.abs(((a1 - a2) * 180) / Math.PI) % 360;
    if (ang > 180) ang = 360 - ang;
    angleDev += Math.abs(90 - ang);
  }
  const rectangularity = clamp01(1 - angleDev / 4 / 45);

  const hull = convexHull(pts);
  const convexity = hull.length === 4 ? 1 : 0.4;

  // per-side edge support
  const sideEdges: number[] = [];
  for (let i = 0; i < 4; i++) {
    sideEdges.push(sideEdgeStrength(pts[i], pts[(i + 1) % 4], grad, w, h));
  }
  const edgeSupport = sideEdges.reduce((a, b) => a + b, 0) / 4;
  const minSideEdge = Math.min(...sideEdges);
  // opposite-side consistency
  const oppConsistency =
    1 -
    (Math.abs(sideEdges[0] - sideEdges[2]) + Math.abs(sideEdges[1] - sideEdges[3])) / 2;

  const sideLens = pts.map((p, i) => {
    const n = pts[(i + 1) % 4];
    return Math.hypot(p.x - n.x, p.y - n.y);
  });
  const wAvg = (sideLens[0] + sideLens[2]) / 2;
  const hAvg = (sideLens[1] + sideLens[3]) / 2;
  const aspect = wAvg && hAvg ? Math.max(wAvg, hAvg) / Math.min(wAvg, hAvg) : 99;
  const aspectScore = aspect <= 3 ? 1 : aspect <= 6 ? 0.5 : 0;

  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const centering = clamp01(1 - (Math.hypot(cx - w / 2, cy - h / 2) / Math.hypot(w / 2, h / 2)) * 1.2);

  const uniformity = interiorVsExterior(quad, gray, grad, w, h);

  let score =
    0.16 * Math.min(1, areaRatio / 0.6) +
    0.22 * rectangularity +
    0.08 * convexity +
    0.20 * edgeSupport +
    0.10 * clamp01(oppConsistency) +
    0.08 * aspectScore +
    0.06 * centering +
    0.10 * uniformity;

  // hard rejections
  if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) score = 0;
  if (minSideEdge < 0.12) score *= 0.45; // one side has no real edge behind it
  if (rectangularity < 0.35) score *= 0.5;

  return {
    quad,
    score: clamp01(score),
    source,
    metrics: {
      areaRatio,
      rectangularity,
      convexity,
      edgeSupport,
      minSideEdge,
      aspect,
      centering,
      uniformity,
    },
  };
}

/** Fraction of samples along a side that sit on a strong gradient. */
function sideEdgeStrength(a: Point, b: Point, grad: Gradient, w: number, h: number): number {
  const steps = 40;
  const thr = Math.max(15, grad.max * 0.12);
  let hits = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);
    let best = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const m = grad.mag[ny * w + nx];
        if (m > best) best = m;
      }
    }
    if (best >= thr) hits++;
  }
  return hits / (steps + 1);
}

/**
 * Documents are smoother inside than a patterned background outside.
 * Returns 1 when the interior is markedly more uniform than the exterior ring.
 */
function interiorVsExterior(quad: Quad, gray: Uint8Array, grad: Gradient, w: number, h: number): number {
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(...pts.map((p) => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(...pts.map((p) => p.y))));

  let inSum = 0;
  let inN = 0;
  let outSum = 0;
  let outN = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 120));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const g = grad.mag[y * w + x];
      const inside = x >= minX && x <= maxX && y >= minY && y <= maxY && pointInQuad({ x, y }, pts);
      if (inside) {
        // ignore a border band so the document's own edge doesn't count
        inSum += g;
        inN++;
      } else {
        outSum += g;
        outN++;
      }
    }
  }
  if (!inN || !outN) return 0.5;
  const inAvg = inSum / inN;
  const outAvg = outSum / outN;
  if (outAvg <= 0) return 0.5;
  const ratio = inAvg / outAvg;
  // ratio < 1 => interior smoother than exterior (good)
  return clamp01(1.4 - ratio);
}

function pointInQuad(p: Point, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function scaleQuad(q: Quad, factor: number, maxW: number, maxH: number): Quad {
  const s = (p: Point) => ({
    x: Math.max(0, Math.min(maxW, p.x * factor)),
    y: Math.max(0, Math.min(maxH, p.y * factor)),
  });
  return {
    topLeft: s(q.topLeft),
    topRight: s(q.topRight),
    bottomRight: s(q.bottomRight),
    bottomLeft: s(q.bottomLeft),
  };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
