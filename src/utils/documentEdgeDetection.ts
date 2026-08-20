/**
 * DOM-free document edge detection.
 *
 * Pure-array pipeline (no canvas / no window), so it can run in the browser,
 * a worker, or a plain Node/Bun harness for regression testing.
 *
 * Pipeline
 *  1. bounded processing copy (nearest-neighbour downscale)
 *  2. grayscale -> Gaussian blur -> CLAHE
 *  3. Pass A: adaptive-hysteresis Canny + morphological close
 *     Pass B: adaptive-mean threshold (both polarities) + Otsu (both polarities)
 *  4. connected components -> convex hull -> approxPolyDP (bbox fallback)
 *  5. ordered quads with duplicate / self-intersection guards
 *  6. candidate scoring (angles, side symmetry, edge support, area, convexity)
 */

export interface Point {
  x: number;
  y: number;
}

/** Ordered corners: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

export interface QuadCandidate {
  quad: Quad;
  score: number;
  source: string;
  metrics: {
    areaRatio: number;
    angleScore: number;
    sideScore: number;
    edgeSupport: number;
    convexity: number;
  };
}

export interface DetectionDebug {
  procWidth: number;
  procHeight: number;
  scale: number;
  cannyLow: number;
  cannyHigh: number;
  otsuThreshold: number;
  candidateCount: number;
  topCandidates: { source: string; score: number }[];
  timings: { total: number };
}

export interface DetectionResult {
  /** Best quad in INPUT (not processing) pixel coordinates, or null. */
  quad: Quad | null;
  score: number;
  reliable: boolean;
  candidates: QuadCandidate[];
  debug: DetectionDebug;
}

/** Minimum score at which an automatic crop may be applied without review. */
export const RELIABLE_SCORE = 0.62;

/** Longest side of the internal processing copy. */
const PROC_MAX_DIM = 512;
const MIN_AREA_RATIO = 0.06;
const MAX_AREA_RATIO = 0.985;

// ─── public helpers ───────────────────────────────────────────────────────────

export function centeredFallbackQuad(width: number, height: number, inset = 0.08): Quad {
  const dx = width * inset;
  const dy = height * inset;
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ];
}

// ─── main entry ───────────────────────────────────────────────────────────────

export function detectDocumentQuad(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): DetectionResult {
  const started = now();

  const scale = Math.min(1, PROC_MAX_DIM / Math.max(width, height));
  const pw = Math.max(16, Math.round(width * scale));
  const ph = Math.max(16, Math.round(height * scale));

  const gray = toGrayscale(rgba, width, height, pw, ph);
  const blurred = gaussianBlur5(gray, pw, ph);
  const equalized = clahe(blurred, pw, ph);

  // Gradient (shared by Canny and by edge-support scoring).
  const grad = sobel(equalized, pw, ph);
  const { low, high } = adaptiveHysteresis(grad.magnitude);

  const masks: { name: string; mask: Uint8Array }[] = [];

  // Pass A — Canny + morphological close.
  const canny = cannyFromGradient(grad, pw, ph, low, high);
  masks.push({ name: 'cannyClose', mask: morphClose(canny, pw, ph) });

  // Pass B — adaptive mean threshold (both polarities) + Otsu (both polarities).
  const adaptive = adaptiveMeanThreshold(equalized, pw, ph, 31, 7);
  masks.push({ name: 'adaptive+', mask: adaptive });
  masks.push({ name: 'adaptive-', mask: invertMask(adaptive) });

  const otsuT = otsuThreshold(equalized);
  const otsu = thresholdMask(equalized, otsuT, false);
  masks.push({ name: 'otsu+', mask: otsu });
  masks.push({ name: 'otsu-', mask: invertMask(otsu) });

  const imgArea = pw * ph;
  const candidates: QuadCandidate[] = [];

  for (const { name, mask } of masks) {
    const components = connectedComponents(mask, pw, ph, imgArea * MIN_AREA_RATIO * 0.35);
    for (const comp of components) {
      const hull = convexHull(comp.points);
      if (hull.length < 4) continue;

      const approx = approxPolyDP(hull, 0.02 * polygonPerimeter(hull));
      const quads: { quad: Quad; source: string }[] = [];

      const fromApprox = approx.length === 4 ? orderQuad(approx as Point[]) : null;
      if (fromApprox) quads.push({ quad: fromApprox, source: `${name}:poly` });

      const bbox = bboxQuad(hull);
      if (bbox) quads.push({ quad: bbox, source: `${name}:bbox` });

      for (const q of quads) {
        if (!isValidQuad(q.quad, pw, ph)) continue;
        const scored = scoreQuad(q.quad, q.source, pw, ph, grad.magnitude, hull);
        if (scored) candidates.push(scored);
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const deduped = dedupeCandidates(candidates, Math.max(pw, ph) * 0.03);

  const best = deduped[0] ?? null;
  const invScale = 1 / (scale || 1);

  return {
    quad: best ? (best.quad.map((p) => ({ x: p.x * invScale, y: p.y * invScale })) as Quad) : null,
    score: best ? best.score : 0,
    reliable: !!best && best.score >= RELIABLE_SCORE,
    candidates: deduped.slice(0, 8).map((c) => ({
      ...c,
      quad: c.quad.map((p) => ({ x: p.x * invScale, y: p.y * invScale })) as Quad,
    })),
    debug: {
      procWidth: pw,
      procHeight: ph,
      scale,
      cannyLow: low,
      cannyHigh: high,
      otsuThreshold: otsuT,
      candidateCount: candidates.length,
      topCandidates: deduped.slice(0, 5).map((c) => ({ source: c.source, score: c.score })),
      timings: { total: Math.round(now() - started) },
    },
  };
}

// ─── preprocessing ────────────────────────────────────────────────────────────

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function toGrayscale(
  rgba: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8Array {
  const out = new Uint8Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      const i = (sy * srcW + sx) * 4;
      out[y * dstW + x] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
    }
  }
  return out;
}

function gaussianBlur5(src: Uint8Array, w: number, h: number): Uint8Array {
  const kernel = [1, 4, 6, 4, 1];
  const norm = 16;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const xx = clampInt(x + k, 0, w - 1);
        sum += src[y * w + xx] * kernel[k + 2];
      }
      tmp[y * w + x] = sum / norm;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const yy = clampInt(y + k, 0, h - 1);
        sum += tmp[yy * w + x] * kernel[k + 2];
      }
      out[y * w + x] = sum / norm;
    }
  }
  return out;
}

/** Contrast Limited Adaptive Histogram Equalization (8x8 tiles, bilinear blend). */
function clahe(src: Uint8Array, w: number, h: number, tiles = 8, clipLimit = 3): Uint8Array {
  const tw = Math.max(1, Math.ceil(w / tiles));
  const th = Math.max(1, Math.ceil(h / tiles));
  const tilesX = Math.ceil(w / tw);
  const tilesY = Math.ceil(h / th);
  const maps: Uint8Array[] = [];

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const hist = new Uint32Array(256);
      let count = 0;
      for (let y = ty * th; y < Math.min(h, (ty + 1) * th); y++) {
        for (let x = tx * tw; x < Math.min(w, (tx + 1) * tw); x++) {
          hist[src[y * w + x]]++;
          count++;
        }
      }
      // Clip and redistribute.
      const limit = Math.max(1, Math.floor((clipLimit * count) / 256));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) {
          excess += hist[i] - limit;
          hist[i] = limit;
        }
      }
      const boost = Math.floor(excess / 256);
      for (let i = 0; i < 256; i++) hist[i] += boost;

      const map = new Uint8Array(256);
      let cum = 0;
      const total = count || 1;
      for (let i = 0; i < 256; i++) {
        cum += hist[i];
        map[i] = clampInt(Math.round((cum / total) * 255), 0, 255);
      }
      maps.push(map);
    }
  }

  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / th - 0.5;
    const ty0 = clampInt(Math.floor(fy), 0, tilesY - 1);
    const ty1 = clampInt(ty0 + 1, 0, tilesY - 1);
    const wy = Math.min(1, Math.max(0, fy - ty0));
    for (let x = 0; x < w; x++) {
      const fx = x / tw - 0.5;
      const tx0 = clampInt(Math.floor(fx), 0, tilesX - 1);
      const tx1 = clampInt(tx0 + 1, 0, tilesX - 1);
      const wx = Math.min(1, Math.max(0, fx - tx0));
      const v = src[y * w + x];
      const a = maps[ty0 * tilesX + tx0][v];
      const b = maps[ty0 * tilesX + tx1][v];
      const c = maps[ty1 * tilesX + tx0][v];
      const d = maps[ty1 * tilesX + tx1][v];
      out[y * w + x] =
        a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) + c * (1 - wx) * wy + d * wx * wy;
    }
  }
  return out;
}

// ─── gradients / Canny ────────────────────────────────────────────────────────

interface Gradient {
  magnitude: Float32Array;
  angle: Float32Array;
  width: number;
  height: number;
}

function sobel(src: Uint8Array, w: number, h: number): Gradient {
  const magnitude = new Float32Array(w * h);
  const angle = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -src[i - w - 1] + src[i - w + 1] - 2 * src[i - 1] + 2 * src[i + 1] - src[i + w - 1] + src[i + w + 1];
      const gy =
        -src[i - w - 1] - 2 * src[i - w] - src[i - w + 1] + src[i + w - 1] + 2 * src[i + w] + src[i + w + 1];
      magnitude[i] = Math.hypot(gx, gy);
      angle[i] = Math.atan2(gy, gx);
    }
  }
  return { magnitude, angle, width: w, height: h };
}

/** Derive hysteresis thresholds from the gradient distribution (percentile based). */
function adaptiveHysteresis(magnitude: Float32Array): { low: number; high: number } {
  const hist = new Uint32Array(1024);
  let max = 0;
  for (let i = 0; i < magnitude.length; i++) if (magnitude[i] > max) max = magnitude[i];
  if (max <= 0) return { low: 1, high: 2 };
  for (let i = 0; i < magnitude.length; i++) {
    hist[Math.min(1023, Math.floor((magnitude[i] / max) * 1023))]++;
  }
  const total = magnitude.length;
  const targetHigh = total * 0.92;
  let cum = 0;
  let highBin = 1023;
  for (let i = 0; i < 1024; i++) {
    cum += hist[i];
    if (cum >= targetHigh) {
      highBin = i;
      break;
    }
  }
  const high = Math.max(8, (highBin / 1023) * max);
  return { low: high * 0.4, high };
}

function cannyFromGradient(
  grad: Gradient,
  w: number,
  h: number,
  low: number,
  high: number
): Uint8Array {
  const { magnitude, angle } = grad;
  const suppressed = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = magnitude[i];
      if (m === 0) continue;
      let a = (angle[i] * 180) / Math.PI;
      if (a < 0) a += 180;
      let n1: number;
      let n2: number;
      if (a < 22.5 || a >= 157.5) {
        n1 = magnitude[i - 1];
        n2 = magnitude[i + 1];
      } else if (a < 67.5) {
        n1 = magnitude[i - w + 1];
        n2 = magnitude[i + w - 1];
      } else if (a < 112.5) {
        n1 = magnitude[i - w];
        n2 = magnitude[i + w];
      } else {
        n1 = magnitude[i - w - 1];
        n2 = magnitude[i + w + 1];
      }
      if (m >= n1 && m >= n2) suppressed[i] = m;
    }
  }

  const out = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < suppressed.length; i++) {
    if (suppressed[i] >= high) {
      out[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!out[ni] && suppressed[ni] >= low) {
          out[ni] = 1;
          stack.push(ni);
        }
      }
    }
  }
  return out;
}

function morphClose(mask: Uint8Array, w: number, h: number): Uint8Array {
  return erode3(dilate3(mask, w, h), w, h);
}

function dilate3(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = clampInt(x + dx, 0, w - 1);
          const ny = clampInt(y + dy, 0, h - 1);
          if (mask[ny * w + nx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

function erode3(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 1;
      for (let dy = -1; dy <= 1 && on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = clampInt(x + dx, 0, w - 1);
          const ny = clampInt(y + dy, 0, h - 1);
          if (!mask[ny * w + nx]) {
            on = 0;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

// ─── thresholding ─────────────────────────────────────────────────────────────

function integralImage(src: Uint8Array, w: number, h: number): Float64Array {
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

function adaptiveMeanThreshold(
  src: Uint8Array,
  w: number,
  h: number,
  window: number,
  c: number
): Uint8Array {
  const ii = integralImage(src, w, h);
  const r = Math.max(1, Math.floor(window / 2));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        ii[(y1 + 1) * (w + 1) + (x1 + 1)] -
        ii[y0 * (w + 1) + (x1 + 1)] -
        ii[(y1 + 1) * (w + 1) + x0] +
        ii[y0 * (w + 1) + x0];
      const mean = sum / area;
      out[y * w + x] = src[y * w + x] > mean - c ? 1 : 0;
    }
  }
  return out;
}

function otsuThreshold(src: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < src.length; i++) hist[src[i]]++;
  const total = src.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

function thresholdMask(src: Uint8Array, t: number, invert: boolean): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const on = src[i] > t ? 1 : 0;
    out[i] = invert ? (on ? 0 : 1) : on;
  }
  return out;
}

function invertMask(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

// ─── components / geometry ────────────────────────────────────────────────────

interface Component {
  points: Point[];
  area: number;
}

function connectedComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea: number,
  maxComponents = 40
): Component[] {
  const visited = new Uint8Array(w * h);
  const comps: Component[] = [];
  const queue = new Int32Array(w * h);

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const points: Point[] = [];

    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i / w) | 0;
      points.push({ x, y });
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (mask[ni] && !visited[ni]) {
            visited[ni] = 1;
            queue[tail++] = ni;
          }
        }
      }
    }

    if (points.length >= minArea) {
      comps.push({ points, area: points.length });
    }
  }

  comps.sort((a, b) => b.area - a.area);
  return comps.slice(0, maxComponents);
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Andrew's monotone chain convex hull (counter-clockwise, no duplicates). */
function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function polygonPerimeter(poly: Point[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

function polygonArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Ramer-Douglas-Peucker on a closed polygon. */
function approxPolyDP(poly: Point[], epsilon: number): Point[] {
  if (poly.length <= 4) return poly.slice();
  // Open the polygon at the pair of farthest-apart vertices for stability.
  let i0 = 0;
  let i1 = 0;
  let maxD = -1;
  for (let i = 0; i < poly.length; i++) {
    for (let j = i + 1; j < poly.length; j++) {
      const d = (poly[i].x - poly[j].x) ** 2 + (poly[i].y - poly[j].y) ** 2;
      if (d > maxD) {
        maxD = d;
        i0 = i;
        i1 = j;
      }
    }
  }
  const first: Point[] = [];
  for (let i = i0; i !== i1; i = (i + 1) % poly.length) first.push(poly[i]);
  first.push(poly[i1]);
  const second: Point[] = [];
  for (let i = i1; i !== i0; i = (i + 1) % poly.length) second.push(poly[i]);
  second.push(poly[i0]);

  const a = rdp(first, epsilon);
  const b = rdp(second, epsilon);
  return a.concat(b.slice(1, -1));
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

function bboxQuad(points: Point[]): Quad | null {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (maxX - minX < 4 || maxY - minY < 4) return null;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/** Order 4 points as TL, TR, BR, BL using angle around the centroid. */
function orderQuad(points: Point[]): Quad | null {
  if (points.length !== 4) return null;
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = points
    .slice()
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // Rotate so the first point is the one closest to the top-left corner.
  let startIdx = 0;
  let bestScore = Infinity;
  sorted.forEach((p, i) => {
    const s = p.x + p.y;
    if (s < bestScore) {
      bestScore = s;
      startIdx = i;
    }
  });
  const ordered = [
    sorted[startIdx],
    sorted[(startIdx + 1) % 4],
    sorted[(startIdx + 2) % 4],
    sorted[(startIdx + 3) % 4],
  ] as Quad;
  return ordered;
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function isValidQuad(q: Quad, w: number, h: number): boolean {
  const minDist = Math.max(6, Math.min(w, h) * 0.04);
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.hypot(q[i].x - q[j].x, q[i].y - q[j].y) < minDist) return false;
    }
  }
  // Self intersection (opposite edges must not cross).
  if (segmentsIntersect(q[0], q[1], q[2], q[3])) return false;
  if (segmentsIntersect(q[1], q[2], q[3], q[0])) return false;

  const area = polygonArea(q);
  const ratio = area / (w * h);
  if (ratio < MIN_AREA_RATIO || ratio > MAX_AREA_RATIO) return false;

  // All corners must be inside the frame (small tolerance).
  const tol = Math.max(w, h) * 0.02;
  for (const p of q) {
    if (p.x < -tol || p.y < -tol || p.x > w + tol || p.y > h + tol) return false;
  }
  return true;
}

// ─── scoring ──────────────────────────────────────────────────────────────────

function scoreQuad(
  quad: Quad,
  source: string,
  w: number,
  h: number,
  magnitude: Float32Array,
  hull: Point[]
): QuadCandidate | null {
  const area = polygonArea(quad);
  if (area <= 0) return null;
  const areaRatio = area / (w * h);

  // Corner angles close to 90 degrees.
  let angleErr = 0;
  for (let i = 0; i < 4; i++) {
    const prev = quad[(i + 3) % 4];
    const cur = quad[i];
    const next = quad[(i + 1) % 4];
    const a1 = Math.atan2(prev.y - cur.y, prev.x - cur.x);
    const a2 = Math.atan2(next.y - cur.y, next.x - cur.x);
    let diff = Math.abs(((a1 - a2) * 180) / Math.PI) % 360;
    if (diff > 180) diff = 360 - diff;
    angleErr += Math.abs(diff - 90);
  }
  const angleScore = Math.max(0, 1 - angleErr / 4 / 40);

  // Opposite sides should have similar lengths.
  const sides = [
    dist(quad[0], quad[1]),
    dist(quad[1], quad[2]),
    dist(quad[2], quad[3]),
    dist(quad[3], quad[0]),
  ];
  const r1 = Math.min(sides[0], sides[2]) / Math.max(sides[0], sides[2]);
  const r2 = Math.min(sides[1], sides[3]) / Math.max(sides[1], sides[3]);
  const sideScore = (r1 + r2) / 2;

  // Gradient support along the quad perimeter.
  const edgeSupport = perimeterEdgeSupport(quad, w, h, magnitude);

  // Convexity vs. the source hull.
  const hullArea = polygonArea(hull) || area;
  const convexity = Math.min(1, Math.min(area, hullArea) / Math.max(area, hullArea));

  // Prefer documents that fill a healthy portion of the frame.
  const areaScore =
    areaRatio < 0.15 ? areaRatio / 0.15 : areaRatio > 0.95 ? Math.max(0, (1 - areaRatio) / 0.05) : 1;

  const score =
    0.28 * angleScore + 0.2 * sideScore + 0.24 * edgeSupport + 0.18 * areaScore + 0.1 * convexity;

  return {
    quad,
    source,
    score: Math.max(0, Math.min(1, score)),
    metrics: { areaRatio, angleScore, sideScore, edgeSupport, convexity },
  };
}

function perimeterEdgeSupport(
  quad: Quad,
  w: number,
  h: number,
  magnitude: Float32Array
): number {
  let max = 0;
  for (let i = 0; i < magnitude.length; i++) if (magnitude[i] > max) max = magnitude[i];
  if (max <= 0) return 0;
  const threshold = max * 0.12;

  let hits = 0;
  let samples = 0;
  for (let e = 0; e < 4; e++) {
    const a = quad[e];
    const b = quad[(e + 1) % 4];
    const steps = Math.max(8, Math.round(dist(a, b)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      samples++;
      let best = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = clampInt(x + dx, 0, w - 1);
          const ny = clampInt(y + dy, 0, h - 1);
          const m = magnitude[ny * w + nx];
          if (m > best) best = m;
        }
      }
      if (best >= threshold) hits++;
    }
  }
  return samples ? hits / samples : 0;
}

function dedupeCandidates(candidates: QuadCandidate[], tolerance: number): QuadCandidate[] {
  const kept: QuadCandidate[] = [];
  for (const c of candidates) {
    const dup = kept.some((k) => k.quad.every((p, i) => dist(p, c.quad[i]) <= tolerance));
    if (!dup) kept.push(c);
  }
  return kept;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampInt(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}