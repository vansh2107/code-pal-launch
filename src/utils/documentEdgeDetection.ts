/**
 * documentEdgeDetection.ts
 *
 * Pure-TypeScript, DOM-free document edge detector.
 *
 * Given raw RGBA pixels it returns an ordered quadrilateral (in ORIGINAL image
 * coordinates) describing the most likely document boundary, plus a confidence
 * score in [0, 1] and structured debug information.
 *
 * Pipeline
 *   1. Resize to a bounded processing copy (scale factors preserved)
 *   2. Grayscale -> Gaussian blur -> CLAHE
 *   3. Pass A: adaptive-hysteresis Canny + morphological close
 *      Pass B: adaptive threshold in BOTH polarities + Otsu
 *   4. Connected components -> convex hull -> approxPolyDP (bbox fallback)
 *   5. Ordered quads with duplicate + self-intersection guards
 *   6. Candidate scoring: area, rectangularity, convexity, per-side edge
 *      support (with min-side penalty), opposite-side consistency, aspect,
 *      centering, interior-vs-exterior gradient uniformity
 */

export interface EdgePoint {
  x: number;
  y: number;
}

export interface DetectedQuad {
  topLeft: EdgePoint;
  topRight: EdGePointAlias;
  bottomRight: EdgePoint;
  bottomLeft: EdgePoint;
}
type EdGePointAlias = EdgePoint;

export interface QuadScoreBreakdown {
  area: number;
  rectangularity: number;
  convexity: number;
  edgeSupport: number;
  minSideSupport: number;
  oppositeConsistency: number;
  aspect: number;
  centering: number;
  uniformity: number;
  total: number;
}

export interface QuadCandidate {
  quad: DetectedQuad;
  score: number;
  breakdown: QuadScoreBreakdown;
  source: string;
}

export interface EdgeDetectionDebug {
  processingWidth: number;
  processingHeight: number;
  scaleX: number;
  scaleY: number;
  candidateCount: number;
  passACandidates: number;
  passBCandidates: number;
  topCandidates: Array<{ source: string; score: number; breakdown: QuadScoreBreakdown }>;
  timings: { total: number };
}

export interface EdgeDetectionResult {
  quad: DetectedQuad;
  score: number;
  breakdown: QuadScoreBreakdown;
  source: string;
  candidates: QuadCandidate[];
  debug: EdgeDetectionDebug;
}

/** Scores at or above this value are considered trustworthy for auto-crop. */
export const RELIABLE_SCORE = 0.62;

const MAX_PROCESSING_DIM = 640;

/* ────────────────────────────── public API ─────────────────────────────── */

export function centeredFallbackQuad(width: number, height: number, inset = 0.06): DetectedQuad {
  const dx = width * inset;
  const dy = height * inset;
  return {
    topLeft: { x: dx, y: dy },
    topRight: { x: width - dx, y: dy },
    bottomRight: { x: width - dx, y: height - dy },
    bottomLeft: { x: dx, y: height - dy },
  };
}

export function detectDocumentQuad(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): EdgeDetectionResult | null {
  const t0 = nowMs();

  // ── 1. Processing copy ──
  const scale = Math.min(1, MAX_PROCESSING_DIM / Math.max(width, height));
  const pw = Math.max(32, Math.round(width * scale));
  const ph = Math.max(32, Math.round(height * scale));
  const scaleX = width / pw;
  const scaleY = height / ph;

  const gray = resizeToGray(pixels, width, height, pw, ph);

  // ── 2. Blur + CLAHE ──
  const blurred = gaussianBlur5(gray, pw, ph);
  const equalized = clahe(blurred, pw, ph, 8, 8, 3.0);

  // Gradient magnitude map is reused by both passes and by scoring.
  const grad = sobelMagnitude(equalized, pw, ph);

  // ── 3. Two independent binary masks ──
  const cannyMask = adaptiveCanny(equalized, grad, pw, ph);
  morphClose(cannyMask, pw, ph, 1);

  const otsuT = otsuThreshold(equalized);
  const masksB: Uint8Array[] = [
    adaptiveThreshold(equalized, pw, ph, 15, 7, false),
    adaptiveThreshold(equalized, pw, ph, 15, 7, true),
    thresholdAt(equalized, otsuT, false),
    thresholdAt(equalized, otsuT, true),
  ];
  masksB.forEach((m) => morphClose(m, pw, ph, 1));

  // ── 4. Candidates ──
  const candidates: QuadCandidate[] = [];
  let passA = 0;
  let passB = 0;

  for (const q of quadsFromMask(cannyMask, pw, ph, 'canny')) {
    candidates.push(q);
    passA++;
  }
  const bLabels = ['adaptive+', 'adaptive-', 'otsu+', 'otsu-'];
  masksB.forEach((mask, i) => {
    for (const q of quadsFromMask(mask, pw, ph, bLabels[i])) {
      candidates.push(q);
      passB++;
    }
  });

  // ── 5/6. Score everything ──
  const scored: QuadCandidate[] = [];
  for (const cand of candidates) {
    const breakdown = scoreQuad(cand.quad, grad, pw, ph);
    if (breakdown.total <= 0) continue;
    scored.push({ ...cand, breakdown, score: breakdown.total });
  }

  scored.sort((a, b) => b.score - a.score);

  const debug: EdgeDetectionDebug = {
    processingWidth: pw,
    processingHeight: ph,
    scaleX,
    scaleY,
    candidateCount: scored.length,
    passACandidates: passA,
    passBCandidates: passB,
    topCandidates: scored.slice(0, 5).map((c) => ({
      source: c.source,
      score: round3(c.score),
      breakdown: roundBreakdown(c.breakdown),
    })),
    timings: { total: Math.round(nowMs() - t0) },
  };

  if (!scored.length) return null;

  const best = scored[0];
  const upscaled = scaleQuad(best.quad, scaleX, scaleY);

  return {
    quad: clampQuad(upscaled, width, height),
    score: best.score,
    breakdown: best.breakdown,
    source: best.source,
    candidates: scored.slice(0, 8).map((c) => ({
      ...c,
      quad: clampQuad(scaleQuad(c.quad, scaleX, scaleY), width, height),
    })),
    debug,
  };
}

/* ───────────────────────────── stage helpers ───────────────────────────── */

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function resizeToGray(
  pixels: Uint8ClampedArray | Uint8Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): Uint8Array {
  const out = new Uint8Array(dw * dh);
  const xRatio = sw / dw;
  const yRatio = sh / dh;

  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y * yRatio);
    const sy1 = Math.min(sh, Math.max(sy0 + 1, Math.floor((y + 1) * yRatio)));
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x * xRatio);
      const sx1 = Math.min(sw, Math.max(sx0 + 1, Math.floor((x + 1) * xRatio)));
      let sum = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const row = sy * sw;
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (row + sx) * 4;
          sum += pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
          count++;
        }
      }
      out[y * dw + x] = count ? Math.round(sum / count) : 0;
    }
  }
  return out;
}

const GAUSS5 = [1, 4, 6, 4, 1];

function gaussianBlur5(src: Uint8Array, w: number, h: number): Uint8Array {
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let wsum = 0;
      for (let k = -2; k <= 2; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        const g = GAUSS5[k + 2];
        acc += src[y * w + xx] * g;
        wsum += g;
      }
      tmp[y * w + x] = acc / wsum;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      let wsum = 0;
      for (let k = -2; k <= 2; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        const g = GAUSS5[k + 2];
        acc += tmp[yy * w + x] * g;
        wsum += g;
      }
      out[y * w + x] = Math.round(acc / wsum);
    }
  }
  return out;
}

/** Contrast Limited Adaptive Histogram Equalization (bilinear tile blend). */
function clahe(
  src: Uint8Array,
  w: number,
  h: number,
  tilesX: number,
  tilesY: number,
  clipLimit: number
): Uint8Array {
  const tw = Math.max(1, Math.ceil(w / tilesX));
  const th = Math.max(1, Math.ceil(h / tilesY));
  const nx = Math.ceil(w / tw);
  const ny = Math.ceil(h / th);
  const maps: Uint8Array[] = [];

  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      const hist = new Float32Array(256);
      const x0 = tx * tw;
      const y0 = ty * th;
      const x1 = Math.min(w, x0 + tw);
      const y1 = Math.min(h, y0 + th);
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[src[y * w + x]]++;
          n++;
        }
      }
      // Clip and redistribute
      const limit = Math.max(1, (clipLimit * n) / 256);
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) {
          excess += hist[i] - limit;
          hist[i] = limit;
        }
      }
      const bonus = excess / 256;
      let cdf = 0;
      const map = new Uint8Array(256);
      const total = n || 1;
      for (let i = 0; i < 256; i++) {
        cdf += hist[i] + bonus;
        map[i] = Math.max(0, Math.min(255, Math.round((cdf / total) * 255)));
      }
      maps.push(map);
    }
  }

  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / th - 0.5;
    const ty0 = Math.floor(fy);
    const wy = fy - ty0;
    for (let x = 0; x < w; x++) {
      const fx = x / tw - 0.5;
      const tx0 = Math.floor(fx);
      const wx = fx - tx0;
      const v = src[y * w + x];
      const m = (tx: number, ty: number) =>
        maps[Math.min(ny - 1, Math.max(0, ty)) * nx + Math.min(nx - 1, Math.max(0, tx))][v];
      const top = m(tx0, ty0) * (1 - wx) + m(tx0 + 1, ty0) * wx;
      const bottom = m(tx0, ty0 + 1) * (1 - wx) + m(tx0 + 1, ty0 + 1) * wx;
      out[y * w + x] = Math.round(top * (1 - wy) + bottom * wy);
    }
  }
  return out;
}

function sobelMagnitude(src: Uint8Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -src[i - w - 1] - 2 * src[i - 1] - src[i + w - 1] +
        src[i - w + 1] + 2 * src[i + 1] + src[i + w + 1];
      const gy =
        -src[i - w - 1] - 2 * src[i - w] - src[i - w + 1] +
        src[i + w - 1] + 2 * src[i + w] + src[i + w + 1];
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

/** Canny with hysteresis thresholds derived from the gradient distribution. */
function adaptiveCanny(
  src: Uint8Array,
  mag: Float32Array,
  w: number,
  h: number
): Uint8Array {
  // Percentile-based high threshold
  const sorted = Float32Array.from(mag);
  sorted.sort();
  const high = sorted[Math.floor(sorted.length * 0.9)] || 40;
  const low = Math.max(6, high * 0.4);

  const strong = new Uint8Array(w * h);
  const weak = new Uint8Array(w * h);
  for (let i = 0; i < mag.length; i++) {
    if (mag[i] >= high) strong[i] = 1;
    else if (mag[i] >= low) weak[i] = 1;
  }

  // Hysteresis: promote weak pixels connected to strong ones (iterative sweep)
  const out = Uint8Array.from(strong);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 6) {
    changed = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!weak[i] || out[i]) continue;
        if (
          out[i - 1] || out[i + 1] || out[i - w] || out[i + w] ||
          out[i - w - 1] || out[i - w + 1] || out[i + w - 1] || out[i + w + 1]
        ) {
          out[i] = 1;
          changed = true;
        }
      }
    }
  }
  return out;
}

function otsuThreshold(src: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < src.length; i++) hist[src[i]]++;
  const total = src.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT;
}

function thresholdAt(src: Uint8Array, t: number, invert: boolean): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const on = invert ? src[i] < t : src[i] >= t;
    out[i] = on ? 1 : 0;
  }
  return out;
}

/** Mean-based adaptive threshold using an integral image. */
function adaptiveThreshold(
  src: Uint8Array,
  w: number,
  h: number,
  radius: number,
  c: number,
  invert: boolean
): Uint8Array {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const mean = sum / area;
      const v = src[y * w + x];
      const on = invert ? v < mean - c : v > mean + c;
      out[y * w + x] = on ? 1 : 0;
    }
  }
  return out;
}

function morphClose(mask: Uint8Array, w: number, h: number, radius: number) {
  const dil = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -radius; dy <= radius && !on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (mask[yy * w + xx]) {
            on = 1;
            break;
          }
        }
      }
      dil[y * w + x] = on;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = 1;
      for (let dy = -radius; dy <= radius && all; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (!dil[yy * w + xx]) {
            all = 0;
            break;
          }
        }
      }
      mask[y * w + x] = all;
    }
  }
}

/* ─────────────────── components -> hull -> quad candidates ─────────────── */

interface Component {
  points: EdgePoint[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function connectedComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  maxComponents = 12
): Component[] {
  const labels = new Int32Array(w * h).fill(0);
  const comps: Component[] = [];
  const stack: number[] = [];
  const minArea = Math.max(60, (w * h) * 0.005);

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    labels[start] = 1;
    stack.length = 0;
    stack.push(start);
    const points: EdgePoint[] = [];
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;

    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      points.push({ x, y });
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (mask[j] && !labels[j]) {
            labels[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    if (points.length >= minArea / 4) {
      comps.push({ points, minX, minY, maxX, maxY });
    }
  }

  comps.sort((a, b) => b.points.length - a.points.length);
  return comps.slice(0, maxComponents);
}

function convexHull(points: EdgePoint[]): EdgePoint[] {
  if (points.length < 4) return points.slice();
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: EdgePoint, a: EdgePoint, b: EdgePoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: EdgePoint[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: EdgePoint[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function perimeter(poly: EdgePoint[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    p += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return p;
}

/** Douglas–Peucker on a closed polygon. */
function approxPolyDP(poly: EdgePoint[], epsilon: number): EdgePoint[] {
  if (poly.length <= 4) return poly.slice();

  const dist = (p: EdgePoint, a: EdgePoint, b: EdgePoint) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
  };

  const simplify = (pts: EdgePoint[]): EdgePoint[] => {
    if (pts.length < 3) return pts;
    let maxD = -1;
    let idx = 0;
    const first = pts[0];
    const last = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], first, last);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD <= epsilon) return [first, last];
    const left = simplify(pts.slice(0, idx + 1));
    const right = simplify(pts.slice(idx));
    return left.slice(0, -1).concat(right);
  };

  const closed = poly.concat([poly[0]]);
  const out = simplify(closed);
  out.pop();
  return out;
}

function polygonArea(poly: EdgePoint[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function orderQuad(pts: EdgePoint[]): DetectedQuad | null {
  if (pts.length !== 4) return null;
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = pts
    .slice()
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // Rotate so the first point is the top-left-most
  let startIdx = 0;
  let bestSum = Infinity;
  sorted.forEach((p, i) => {
    const s = p.x + p.y;
    if (s < bestSum) {
      bestSum = s;
      startIdx = i;
    }
  });
  const r = sorted.slice(startIdx).concat(sorted.slice(0, startIdx));
  const quad: DetectedQuad = {
    topLeft: r[0],
    topRight: r[1],
    bottomRight: r[2],
    bottomLeft: r[3],
  };
  if (!isValidQuad(quad)) return null;
  return quad;
}

function isValidQuad(q: DetectedQuad): boolean {
  const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
  // Duplicate guard
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < 4) return false;
    }
  }
  // Self-intersection guard: diagonals must cross, adjacent sides must not
  if (!segmentsIntersect(pts[0], pts[2], pts[1], pts[3])) return false;
  if (segmentsIntersect(pts[0], pts[1], pts[2], pts[3])) return false;
  if (segmentsIntersect(pts[1], pts[2], pts[3], pts[0])) return false;
  return polygonArea(pts) > 0;
}

function segmentsIntersect(a: EdgePoint, b: EdgePoint, c: EdgePoint, d: EdgePoint): boolean {
  const o = (p: EdgePoint, q: EdgePoint, r: EdgePoint) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

function bboxQuad(comp: Component): DetectedQuad {
  return {
    topLeft: { x: comp.minX, y: comp.minY },
    topRight: { x: comp.maxX, y: comp.minY },
    bottomRight: { x: comp.maxX, y: comp.maxY },
    bottomLeft: { x: comp.minX, y: comp.maxY },
  };
}

function quadsFromMask(
  mask: Uint8Array,
  w: number,
  h: number,
  source: string
): QuadCandidate[] {
  const out: QuadCandidate[] = [];
  const comps = connectedComponents(mask, w, h);
  const empty: QuadScoreBreakdown = {
    area: 0, rectangularity: 0, convexity: 0, edgeSupport: 0, minSideSupport: 0,
    oppositeConsistency: 0, aspect: 0, centering: 0, uniformity: 0, total: 0,
  };

  for (const comp of comps) {
    const hull = convexHull(comp.points);
    if (hull.length < 4) continue;
    const per = perimeter(hull);

    for (const factor of [0.02, 0.035, 0.05, 0.08]) {
      const approx = approxPolyDP(hull, per * factor);
      if (approx.length === 4) {
        const quad = orderQuad(approx);
        if (quad) out.push({ quad, score: 0, breakdown: empty, source: `${source}:dp${factor}` });
      }
    }
    // bbox fallback for this component
    out.push({ quad: bboxQuad(comp), score: 0, breakdown: empty, source: `${source}:bbox` });
  }
  return out;
}

/* ────────────────────────────── scoring ────────────────────────────────── */

function scoreQuad(
  quad: DetectedQuad,
  grad: Float32Array,
  w: number,
  h: number
): QuadScoreBreakdown {
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const imageArea = w * h;
  const area = polygonArea(pts);
  const areaRatio = area / imageArea;

  const zero: QuadScoreBreakdown = {
    area: 0, rectangularity: 0, convexity: 0, edgeSupport: 0, minSideSupport: 0,
    oppositeConsistency: 0, aspect: 0, centering: 0, uniformity: 0, total: 0,
  };
  if (areaRatio < 0.08 || areaRatio > 0.995) return zero;

  // Area preference: peaks around 55% of the frame
  const areaScore = clamp01(1 - Math.abs(areaRatio - 0.55) / 0.55);

  // Side lengths & angles
  const sides = [0, 1, 2, 3].map((i) => {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y) };
  });

  const angles = [0, 1, 2, 3].map((i) => {
    const prev = pts[(i + 3) % 4];
    const cur = pts[i];
    const next = pts[(i + 1) % 4];
    const v1 = { x: prev.x - cur.x, y: prev.y - cur.y };
    const v2 = { x: next.x - cur.x, y: next.y - cur.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m = (Math.hypot(v1.x, v1.y) || 1) * (Math.hypot(v2.x, v2.y) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
  });
  const rectangularity = clamp01(
    1 - angles.reduce((s, a) => s + Math.abs(a - 90), 0) / (4 * 45)
  );

  // Convexity: quad area / its convex hull area
  const hullArea = polygonArea(convexHull(pts));
  const convexity = hullArea > 0 ? clamp01(area / hullArea) : 0;

  // Per-side edge support from the gradient map
  const supports = sides.map((s) => sideSupport(s.a, s.b, grad, w, h));
  const edgeSupport = supports.reduce((a, b) => a + b, 0) / 4;
  const minSideSupport = Math.min(...supports);

  // Opposite-side consistency (lengths of opposite sides should match)
  const consistency = (a: number, b: number) =>
    clamp01(1 - Math.abs(a - b) / Math.max(a, b, 1));
  const oppositeConsistency =
    (consistency(sides[0].len, sides[2].len) + consistency(sides[1].len, sides[3].len)) / 2;

  // Aspect ratio plausibility (documents: 1:1 .. 1:2.2)
  const wAvg = (sides[0].len + sides[2].len) / 2;
  const hAvg = (sides[1].len + sides[3].len) / 2;
  const ratio = Math.max(wAvg, hAvg) / Math.max(1, Math.min(wAvg, hAvg));
  const aspect = ratio <= 2.2 ? 1 : clamp01(1 - (ratio - 2.2) / 2);

  // Centering of the quad centroid
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const centering = clamp01(
    1 - (Math.abs(cx - w / 2) / (w / 2) + Math.abs(cy - h / 2) / (h / 2)) / 2
  );

  // Interior should be smoother than the region just outside the border
  const uniformity = gradientUniformity(pts, grad, w, h);

  let total =
    areaScore * 0.14 +
    rectangularity * 0.18 +
    convexity * 0.08 +
    edgeSupport * 0.26 +
    oppositeConsistency * 0.1 +
    aspect * 0.06 +
    centering * 0.06 +
    uniformity * 0.12;

  // Hard penalty when any single side lacks support (classic false positive)
  if (minSideSupport < 0.25) total *= 0.55 + minSideSupport;

  return {
    area: areaScore,
    rectangularity,
    convexity,
    edgeSupport,
    minSideSupport,
    oppositeConsistency,
    aspect,
    centering,
    uniformity,
    total: clamp01(total),
  };
}

function sideSupport(
  a: EdgePoint,
  b: EdgePoint,
  grad: Float32Array,
  w: number,
  h: number
): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(8, Math.round(len));
  let hits = 0;
  let samples = 0;
  const threshold = 30;

  // Normal direction for a small perpendicular search
  const nx = -(b.y - a.y) / (len || 1);
  const ny = (b.x - a.x) / (len || 1);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    let best = 0;
    for (let d = -2; d <= 2; d++) {
      const x = Math.round(px + nx * d);
      const y = Math.round(py + ny * d);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const g = grad[y * w + x];
      if (g > best) best = g;
    }
    samples++;
    if (best >= threshold) hits++;
  }
  return samples ? hits / samples : 0;
}

function gradientUniformity(
  pts: EdgePoint[],
  grad: Float32Array,
  w: number,
  h: number
): number {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const shrink = (f: number) =>
    pts.map((p) => ({ x: cx + (p.x - cx) * f, y: cy + (p.y - cy) * f }));

  const inner = shrink(0.8);
  const outer = shrink(1.15);

  const meanIn = meanGradInPolygon(inner, grad, w, h);
  const meanOut = meanGradInRing(outer, inner, grad, w, h);
  if (meanOut <= 0 && meanIn <= 0) return 0.5;
  // A real document border has more structure just outside/at the border
  return clamp01(meanOut / (meanIn + meanOut + 1e-6) + 0.15);
}

function pointInPolygon(x: number, y: number, poly: EdgePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polyBounds(poly: EdgePoint[], w: number, h: number) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return {
    x0: Math.max(0, Math.floor(Math.min(...xs))),
    x1: Math.min(w - 1, Math.ceil(Math.max(...xs))),
    y0: Math.max(0, Math.floor(Math.min(...ys))),
    y1: Math.min(h - 1, Math.ceil(Math.max(...ys))),
  };
}

function meanGradInPolygon(poly: EdgePoint[], grad: Float32Array, w: number, h: number): number {
  const { x0, x1, y0, y1 } = polyBounds(poly, w, h);
  const step = Math.max(1, Math.round(Math.max(x1 - x0, y1 - y0) / 80));
  let sum = 0;
  let n = 0;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      if (!pointInPolygon(x, y, poly)) continue;
      sum += grad[y * w + x];
      n++;
    }
  }
  return n ? sum / n : 0;
}

function meanGradInRing(
  outer: EdgePoint[],
  inner: EdgePoint[],
  grad: Float32Array,
  w: number,
  h: number
): number {
  const { x0, x1, y0, y1 } = polyBounds(outer, w, h);
  const step = Math.max(1, Math.round(Math.max(x1 - x0, y1 - y0) / 80));
  let sum = 0;
  let n = 0;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      if (!pointInPolygon(x, y, outer)) continue;
      if (pointInPolygon(x, y, inner)) continue;
      sum += grad[y * w + x];
      n++;
    }
  }
  return n ? sum / n : 0;
}

/* ───────────────────────────── small utils ─────────────────────────────── */

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function roundBreakdown(b: QuadScoreBreakdown): QuadScoreBreakdown {
  return Object.fromEntries(
    Object.entries(b).map(([k, v]) => [k, round3(v as number)])
  ) as unknown as QuadScoreBreakdown;
}

function scaleQuad(q: DetectedQuad, sx: number, sy: number): DetectedQuad {
  const s = (p: EdgePoint) => ({ x: p.x * sx, y: p.y * sy });
  return {
    topLeft: s(q.topLeft),
    topRight: s(q.topRight),
    bottomRight: s(q.bottomRight),
    bottomLeft: s(q.bottomLeft),
  };
}

function clampQuad(q: DetectedQuad, w: number, h: number): DetectedQuad {
  const c = (p: EdgePoint) => ({
    x: Math.max(0, Math.min(w, p.x)),
    y: Math.max(0, Math.min(h, p.y)),
  });
  return {
    topLeft: c(q.topLeft),
    topRight: c(q.topRight),
    bottomRight: c(q.bottomRight),
    bottomLeft: c(q.bottomLeft),
  };
}
