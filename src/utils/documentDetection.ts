/**
 * Real document detection pipeline (no simple bounding-box heuristics).
 *
 * NORMALIZE -> RESIZE -> GRAYSCALE -> GAUSSIAN BLUR -> EDGE DETECTION (Canny)
 * -> MORPHOLOGICAL CLEANUP -> LINE (HOUGH) DETECTION -> FOUR-CORNER QUADS
 * -> GEOMETRY VALIDATION -> CANDIDATE SCORING -> RANKED CANDIDATES
 *
 * The detector works on a downscaled image for speed and returns candidate
 * quadrilaterals in DETECTION coordinates. Callers must scale the corners back
 * to the original resolution and run the perspective transform there.
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

export interface QuadCandidate {
  quad: Quad;
  score: number;
  confidence: number;
  areaRatio: number;
  rectangularity: number;
  edgeSupport: number;
  aspect: number;
  source: 'hough' | 'contrast';
}

const MIN_AREA_RATIO = 0.08;
const MAX_AREA_RATIO = 0.985;
const CANNY_LOW = 40;
const CANNY_HIGH = 110;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/* ── Stage 1: grayscale ─────────────────────────────────────────────────── */

export function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return gray;
}

/* ── Stage 2: gaussian blur (separable 5-tap) ───────────────────────────── */

export function gaussianBlur(gray: Uint8Array, width: number, height: number): Uint8Array {
  const k = [1, 4, 6, 4, 1];
  const kSum = 16;
  const tmp = new Float32Array(width * height);
  const out = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const xi = Math.max(0, Math.min(width - 1, x + i));
        s += gray[y * width + xi] * k[i + 2];
      }
      tmp[y * width + x] = s / kSum;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const yi = Math.max(0, Math.min(height - 1, y + i));
        s += tmp[yi * width + x] * k[i + 2];
      }
      out[y * width + x] = s / kSum;
    }
  }
  return out;
}

/* ── Stage 3: Canny edge detection ──────────────────────────────────────── */

export interface EdgeMap {
  edges: Uint8Array;
  magnitude: Float32Array;
}

export function cannyEdges(gray: Uint8Array, width: number, height: number): EdgeMap {
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const tl = gray[idx - width - 1], t = gray[idx - width], tr = gray[idx - width + 1];
      const l = gray[idx - 1], r = gray[idx + 1];
      const bl = gray[idx + width - 1], b = gray[idx + width], br = gray[idx + width + 1];
      const gx = -tl + tr - 2 * l + 2 * r - bl + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      direction[idx] = Math.atan2(gy, gx);
    }
  }

  // Non-maximum suppression
  const nms = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const mag = magnitude[idx];
      if (mag === 0) continue;
      const a = ((direction[idx] * 180) / Math.PI + 180) % 180;
      let q: number, r: number;
      if (a < 22.5 || a >= 157.5) {
        q = magnitude[idx + 1]; r = magnitude[idx - 1];
      } else if (a < 67.5) {
        q = magnitude[idx + width - 1]; r = magnitude[idx - width + 1];
      } else if (a < 112.5) {
        q = magnitude[idx + width]; r = magnitude[idx - width];
      } else {
        q = magnitude[idx - width - 1]; r = magnitude[idx + width + 1];
      }
      if (mag >= q && mag >= r) nms[idx] = mag;
    }
  }

  // Adaptive hysteresis thresholds based on the gradient distribution
  let maxMag = 0;
  for (let i = 0; i < nms.length; i++) if (nms[i] > maxMag) maxMag = nms[i];
  const high = Math.max(CANNY_HIGH, maxMag * 0.28);
  const low = Math.max(CANNY_LOW, high * 0.4);

  const edges = new Uint8Array(width * height);
  const strong: number[] = [];
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) { edges[i] = 255; strong.push(i); }
  }
  // Hysteresis: grow weak edges connected to strong ones
  while (strong.length) {
    const idx = strong.pop()!;
    const x = idx % width;
    const y = (idx / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
        const nIdx = ny * width + nx;
        if (edges[nIdx] === 0 && nms[nIdx] >= low) {
          edges[nIdx] = 255;
          strong.push(nIdx);
        }
      }
    }
  }

  return { edges, magnitude: nms };
}

/* ── Stage 4: morphological cleanup (close = dilate then erode) ─────────── */

function morph(src: Uint8Array, width: number, height: number, radius: number, dilate: boolean): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = dilate ? 0 : 255;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) { if (!dilate) v = 0; continue; }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) { if (!dilate) v = 0; continue; }
          const s = src[yy * width + xx];
          v = dilate ? Math.max(v, s) : Math.min(v, s);
        }
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

export function morphClose(edges: Uint8Array, width: number, height: number): Uint8Array {
  return morph(morph(edges, width, height, 2, true), width, height, 1, false);
}

/* ── Stage 5: Hough line detection ──────────────────────────────────────── */

interface Line {
  theta: number; // normal angle, radians [0, PI)
  rho: number;
  votes: number;
}

function houghLines(edges: Uint8Array, width: number, height: number): Line[] {
  const thetaSteps = 180;
  const dTheta = Math.PI / thetaSteps;
  const diag = Math.ceil(Math.sqrt(width * width + height * height));
  const rhoOffset = diag;
  const rhoSize = diag * 2 + 1;
  const acc = new Int32Array(thetaSteps * rhoSize);

  const cosT = new Float32Array(thetaSteps);
  const sinT = new Float32Array(thetaSteps);
  for (let t = 0; t < thetaSteps; t++) {
    cosT[t] = Math.cos(t * dTheta);
    sinT[t] = Math.sin(t * dTheta);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] === 0) continue;
      for (let t = 0; t < thetaSteps; t++) {
        const rho = Math.round(x * cosT[t] + y * sinT[t]) + rhoOffset;
        acc[t * rhoSize + rho]++;
      }
    }
  }

  // Peak extraction with local non-maximum suppression
  const minVotes = Math.max(25, Math.floor(Math.min(width, height) * 0.18));
  const peaks: Line[] = [];
  for (let t = 0; t < thetaSteps; t++) {
    for (let r = 1; r < rhoSize - 1; r++) {
      const v = acc[t * rhoSize + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -2; dt <= 2 && isMax; dt++) {
        const tt = (t + dt + thetaSteps) % thetaSteps;
        for (let dr = -6; dr <= 6; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= rhoSize) continue;
          if (acc[tt * rhoSize + rr] > v) { isMax = false; break; }
        }
      }
      if (isMax) peaks.push({ theta: t * dTheta, rho: r - rhoOffset, votes: v });
    }
  }

  peaks.sort((a, b) => b.votes - a.votes);
  return peaks;
}

function lineIntersect(a: Line, b: Line): Point | null {
  const det = Math.cos(a.theta) * Math.sin(b.theta) - Math.sin(a.theta) * Math.cos(b.theta);
  if (Math.abs(det) < 1e-6) return null;
  const x = (a.rho * Math.sin(b.theta) - b.rho * Math.sin(a.theta)) / det;
  const y = (b.rho * Math.cos(a.theta) - a.rho * Math.cos(b.theta)) / det;
  return { x, y };
}

/* ── Stage 6: geometry helpers ──────────────────────────────────────────── */

export function quadArea(q: Quad): number {
  const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function isConvex(q: Quad): boolean {
  const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function cornerAngles(q: Quad): number[] {
  const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
  const angles: number[] = [];
  for (let i = 0; i < 4; i++) {
    const prev = pts[(i + 3) % 4], cur = pts[i], next = pts[(i + 1) % 4];
    const v1 = { x: prev.x - cur.x, y: prev.y - cur.y };
    const v2 = { x: next.x - cur.x, y: next.y - cur.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
    angles.push(m === 0 ? 0 : (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI);
  }
  return angles;
}

/** Order any 4 points into TL, TR, BR, BL. */
export function orderCorners(points: Point[]): Quad {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const sorted = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
  // sorted is counter/clockwise starting anywhere; rotate so the top-left-most is first
  let startIdx = 0;
  let best = Infinity;
  sorted.forEach((p, i) => {
    const d = p.x + p.y;
    if (d < best) { best = d; startIdx = i; }
  });
  const ordered = [0, 1, 2, 3].map((i) => sorted[(startIdx + i) % 4]);
  // ensure clockwise (TL, TR, BR, BL)
  const cross =
    (ordered[1].x - ordered[0].x) * (ordered[2].y - ordered[1].y) -
    (ordered[1].y - ordered[0].y) * (ordered[2].x - ordered[1].x);
  const cw = cross > 0 ? ordered : [ordered[0], ordered[3], ordered[2], ordered[1]];
  return { topLeft: cw[0], topRight: cw[1], bottomRight: cw[2], bottomLeft: cw[3] };
}

/* ── Stage 7: candidate scoring ─────────────────────────────────────────── */

function sideSupport(
  a: Point,
  b: Point,
  edges: Uint8Array,
  width: number,
  height: number
): number {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const samples = Math.max(12, Math.min(120, Math.round(len / 4)));
  let hit = 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    let found = false;
    for (let dy = -3; dy <= 3 && !found; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = Math.round(px + dx), y = Math.round(py + dy);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (edges[y * width + x] > 0) { found = true; break; }
      }
    }
    if (found) hit++;
  }
  return hit / (samples + 1);
}

function scoreQuad(
  quad: Quad,
  edges: Uint8Array,
  width: number,
  height: number,
  source: 'hough' | 'contrast'
): QuadCandidate | null {
  const imgArea = width * height;
  const area = quadArea(quad);
  const areaRatio = area / imgArea;
  if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) return null;
  if (!isConvex(quad)) return null;

  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  // All corners must be inside (or barely outside) the frame
  const slack = Math.max(width, height) * 0.04;
  for (const p of pts) {
    if (p.x < -slack || p.y < -slack || p.x > width + slack || p.y > height + slack) return null;
  }

  const angles = cornerAngles(quad);
  const angleError = angles.reduce((s, a) => s + Math.abs(a - 90), 0) / 4;
  if (angles.some((a) => a < 50 || a > 130)) return null;
  const angleScore = clamp01(1 - angleError / 35);

  const topW = Math.hypot(quad.topRight.x - quad.topLeft.x, quad.topRight.y - quad.topLeft.y);
  const botW = Math.hypot(quad.bottomRight.x - quad.bottomLeft.x, quad.bottomRight.y - quad.bottomLeft.y);
  const leftH = Math.hypot(quad.bottomLeft.x - quad.topLeft.x, quad.bottomLeft.y - quad.topLeft.y);
  const rightH = Math.hypot(quad.bottomRight.x - quad.topRight.x, quad.bottomRight.y - quad.topRight.y);
  const w = Math.max(topW, botW);
  const h = Math.max(leftH, rightH);
  if (w < width * 0.18 || h < height * 0.18) return null;

  // Perspective plausibility: opposite sides must not differ wildly
  const wSkew = Math.min(topW, botW) / Math.max(topW, botW);
  const hSkew = Math.min(leftH, rightH) / Math.max(leftH, rightH);
  if (wSkew < 0.55 || hSkew < 0.55) return null;
  const perspectiveScore = clamp01((wSkew + hSkew) / 2);

  // Rectangularity: quad area vs. its own bounding box
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const bboxArea = Math.max(1, (maxX - minX) * (maxY - minY));
  const rectangularity = clamp01(area / bboxArea);

  // Aspect: documents range roughly from 1:2 to 2:1 (both orientations)
  const aspect = w / h;
  const normAspect = aspect >= 1 ? aspect : 1 / aspect;
  if (normAspect > 3.5) return null;
  const aspectScore = clamp01(1 - Math.max(0, normAspect - 1.05) / 2.6);

  // Boundary evidence along the four sides
  const support =
    (sideSupport(quad.topLeft, quad.topRight, edges, width, height) +
      sideSupport(quad.topRight, quad.bottomRight, edges, width, height) +
      sideSupport(quad.bottomRight, quad.bottomLeft, edges, width, height) +
      sideSupport(quad.bottomLeft, quad.topLeft, edges, width, height)) / 4;
  if (support < 0.45) return null;

  // Area preference: peaks around 55% of frame, never lets a full-frame win outright
  const areaScore = clamp01(1 - Math.abs(areaRatio - 0.55) / 0.55);

  // Full-frame penalty: a quad hugging every border is likely the photo itself
  const borderMargin = Math.max(4, Math.min(width, height) * 0.012);
  let touching = 0;
  if (minX <= borderMargin) touching++;
  if (minY <= borderMargin) touching++;
  if (maxX >= width - 1 - borderMargin) touching++;
  if (maxY >= height - 1 - borderMargin) touching++;
  const borderPenalty = touching >= 4 ? 0.35 : touching === 3 ? 0.12 : 0;

  const score =
    support * 0.34 +
    angleScore * 0.18 +
    rectangularity * 0.14 +
    areaScore * 0.14 +
    perspectiveScore * 0.10 +
    aspectScore * 0.10 -
    borderPenalty;

  const confidence = clamp01(score * (source === 'hough' ? 1 : 0.8));

  return {
    quad,
    score,
    confidence,
    areaRatio,
    rectangularity,
    edgeSupport: support,
    aspect: normAspect,
    source,
  };
}

/* ── Stage 8: fallback — colour-contrast region ─────────────────────────── */

function contrastCandidate(
  data: Uint8ClampedArray,
  edges: Uint8Array,
  width: number,
  height: number
): QuadCandidate | null {
  // Estimate background from the frame border
  let r = 0, g = 0, b = 0, n = 0;
  const band = Math.max(2, Math.floor(Math.min(width, height) * 0.03));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x > band && x < width - band && y > band && y < height - band) continue;
      const i = (y * width + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  if (!n) return null;
  r /= n; g /= n; b /= n;

  const threshold = 42;
  let minX = width, minY = height, maxX = 0, maxY = 0, count = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const d = Math.hypot(data[i] - r, data[i + 1] - g, data[i + 2] - b);
      if (d > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }
  if (count < 50 || maxX - minX < width * 0.2 || maxY - minY < height * 0.2) return null;

  const quad = orderCorners([
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]);
  return scoreQuad(quad, edges, width, height, 'contrast');
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Returns ranked document quadrilateral candidates in DETECTION coordinates.
 */
export function detectDocumentCandidates(
  imageData: ImageData,
  width: number,
  height: number
): QuadCandidate[] {
  const gray = toGrayscale(imageData.data, width, height);
  const blurred = gaussianBlur(gray, width, height);
  const { edges } = cannyEdges(blurred, width, height);
  const cleaned = morphClose(edges, width, height);

  const lines = houghLines(cleaned, width, height);

  // Split into near-horizontal (normal ~90 degrees) and near-vertical lines
  const horizontals: Line[] = [];
  const verticals: Line[] = [];
  for (const l of lines) {
    const deg = (l.theta * 180) / Math.PI;
    if (deg > 55 && deg < 125) horizontals.push(l);
    else verticals.push(l);
    if (horizontals.length >= 14 && verticals.length >= 14) break;
  }

  const hs = horizontals.slice(0, 14);
  const vs = verticals.slice(0, 14);
  const candidates: QuadCandidate[] = [];

  for (let i = 0; i < hs.length; i++) {
    for (let j = i + 1; j < hs.length; j++) {
      // reject near-duplicate lines
      if (Math.abs(hs[i].rho - hs[j].rho) < height * 0.15) continue;
      for (let k = 0; k < vs.length; k++) {
        for (let m = k + 1; m < vs.length; m++) {
          if (Math.abs(vs[k].rho - vs[m].rho) < width * 0.15) continue;
          const pts = [
            lineIntersect(hs[i], vs[k]),
            lineIntersect(hs[i], vs[m]),
            lineIntersect(hs[j], vs[k]),
            lineIntersect(hs[j], vs[m]),
          ];
          if (pts.some((p) => p === null)) continue;
          const quad = orderCorners(pts as Point[]);
          const scored = scoreQuad(quad, cleaned, width, height, 'hough');
          if (scored) candidates.push(scored);
        }
      }
    }
  }

  const fallback = contrastCandidate(imageData.data, cleaned, width, height);
  if (fallback) candidates.push(fallback);

  candidates.sort((a, b) => b.score - a.score);

  // De-duplicate near-identical quads so "next best candidate" is meaningful
  const unique: QuadCandidate[] = [];
  const tol = Math.max(width, height) * 0.04;
  for (const c of candidates) {
    const dup = unique.some((u) => {
      const keys: (keyof Quad)[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
      return keys.every((k) => Math.hypot(u.quad[k].x - c.quad[k].x, u.quad[k].y - c.quad[k].y) < tol);
    });
    if (!dup) unique.push(c);
    if (unique.length >= 6) break;
  }
  return unique;
}

/* ── Perspective transform (true projective homography) ─────────────────── */

/** Solves the homography mapping the unit-destination rect corners to src quad. */
function computeHomography(
  dst: Point[], // destination (output) corners
  src: Point[]  // source (input) corners
): number[] | null {
  // Solve A h = b for h = [a,b,c,d,e,f,g,h] mapping dst -> src
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = dst[i];
    const { x: u, y: v } = src[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    B.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    B.push(v);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    }
    if (Math.abs(A[pivot][col]) < 1e-9) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [B[col], B[pivot]] = [B[pivot], B[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = A[row][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[row][c] -= f * A[col][c];
      B[row] -= f * B[col];
    }
  }
  const h = new Array(9);
  for (let i = 0; i < n; i++) h[i] = B[i] / A[i][i];
  h[8] = 1;
  return h;
}

export interface WarpResult {
  data: ImageData;
  width: number;
  height: number;
}

/**
 * Perspective-corrects the quad out of the source image using a true
 * projective homography and bilinear resampling.
 */
export function perspectiveWarp(
  srcData: ImageData,
  srcWidth: number,
  srcHeight: number,
  quad: Quad
): WarpResult | null {
  const topW = Math.hypot(quad.topRight.x - quad.topLeft.x, quad.topRight.y - quad.topLeft.y);
  const botW = Math.hypot(quad.bottomRight.x - quad.bottomLeft.x, quad.bottomRight.y - quad.bottomLeft.y);
  const leftH = Math.hypot(quad.bottomLeft.x - quad.topLeft.x, quad.bottomLeft.y - quad.topLeft.y);
  const rightH = Math.hypot(quad.bottomRight.x - quad.topRight.x, quad.bottomRight.y - quad.topRight.y);

  const outW = Math.round(Math.max(topW, botW));
  const outH = Math.round(Math.max(leftH, rightH));
  if (outW < 120 || outH < 120) return null;
  if (outW * outH > 40_000_000) return null;

  const h = computeHomography(
    [{ x: 0, y: 0 }, { x: outW - 1, y: 0 }, { x: outW - 1, y: outH - 1 }, { x: 0, y: outH - 1 }],
    [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
  );
  if (!h) return null;

  const out = new ImageData(outW, outH);
  const s = srcData.data;
  const d = out.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = h[6] * x + h[7] * y + h[8];
      if (denom === 0) continue;
      const sx = (h[0] * x + h[1] * y + h[2]) / denom;
      const sy = (h[3] * x + h[4] * y + h[5]) / denom;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= srcWidth || y0 >= srcHeight) {
        const di = (y * outW + x) * 4;
        d[di] = 255; d[di + 1] = 255; d[di + 2] = 255; d[di + 3] = 255;
        continue;
      }
      const x1 = Math.min(x0 + 1, srcWidth - 1);
      const y1 = Math.min(y0 + 1, srcHeight - 1);
      const fx = sx - x0, fy = sy - y0;
      const di = (y * outW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v00 = s[(y0 * srcWidth + x0) * 4 + c];
        const v10 = s[(y0 * srcWidth + x1) * 4 + c];
        const v01 = s[(y1 * srcWidth + x0) * 4 + c];
        const v11 = s[(y1 * srcWidth + x1) * 4 + c];
        d[di + c] =
          v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
      }
      d[di + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

/* ── Crop quality validation ────────────────────────────────────────────── */

export function validateCrop(
  candidate: QuadCandidate,
  outW: number,
  outH: number,
  detW: number,
  detH: number
): boolean {
  if (!Number.isFinite(outW) || !Number.isFinite(outH)) return false;
  if (outW < 150 || outH < 150) return false;
  if (candidate.areaRatio < MIN_AREA_RATIO) return false;
  // A crop that keeps essentially the whole frame is not a crop
  if (candidate.areaRatio > 0.97) return false;
  if (candidate.aspect > 3.5) return false;
  if (candidate.rectangularity < 0.6) return false;
  if (candidate.edgeSupport < 0.45) return false;
  // Sanity: output must not be wildly larger than the detected region
  const detArea = detW * detH;
  if (detArea > 0 && candidate.areaRatio * detArea < detArea * 0.05) return false;
  return true;
}
