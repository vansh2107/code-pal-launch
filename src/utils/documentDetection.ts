/**
 * Document boundary detection + true 4-point perspective transform.
 *
 * Pipeline (deterministic):
 *   grayscale -> gaussian blur -> sobel -> adaptive canny (NMS + hysteresis)
 *   -> morphological close -> Hough line transform -> line grouping
 *   -> quadrilateral candidates (line intersections) -> geometry validation
 *   -> multi-signal scoring -> ranked candidate list
 *
 * NOTE: no bounding-box cropping anywhere. Corners come from line
 * intersections, so tilted documents produce a real (non-axis-aligned) quad.
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

export interface DocumentCandidate {
  quad: Quad;
  score: number;
  confidence: number;
  areaRatio: number;
  edgeSupport: number;
}

// ─── Tunables ────────────────────────────────────────────────────────────────
const MIN_AREA_RATIO = 0.08;
const MAX_AREA_RATIO = 0.985;
const MIN_CORNER_ANGLE = 55;
const MAX_CORNER_ANGLE = 125;
const MIN_SIDE_RATIO = 0.05; // shortest side vs image min dimension
const MAX_ASPECT = 6;
const MIN_ASPECT = 1 / 6;
const MAX_CANDIDATES = 6;

// ─── Basic image ops ─────────────────────────────────────────────────────────

export function toGrayscale(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return out;
}

/** Separable 5-tap gaussian (sigma ~1.1) */
export function gaussianBlur(src: Float32Array, w: number, h: number): Float32Array {
  const k = [0.0625, 0.25, 0.375, 0.25, 0.0625];
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        s += src[y * w + xx] * k[i + 2];
      }
      tmp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        s += tmp[yy * w + x] * k[i + 2];
      }
      out[y * w + x] = s;
    }
  }
  return out;
}

/** Canny with adaptive (percentile-based) hysteresis thresholds. */
export function cannyEdges(gray: Float32Array, w: number, h: number): Uint8Array {
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] + gray[i - w + 1] +
        -2 * gray[i - 1] + 2 * gray[i + 1] +
        -gray[i + w - 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
        gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
      dir[i] = Math.atan2(gy, gx);
    }
  }

  // Non-maximum suppression
  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m === 0) continue;
      const a = ((dir[i] * 180) / Math.PI + 180) % 180;
      let p: number, q: number;
      if (a < 22.5 || a >= 157.5) { p = mag[i - 1]; q = mag[i + 1]; }
      else if (a < 67.5) { p = mag[i - w + 1]; q = mag[i + w - 1]; }
      else if (a < 112.5) { p = mag[i - w]; q = mag[i + w]; }
      else { p = mag[i - w - 1]; q = mag[i + w + 1]; }
      if (m >= p && m >= q) nms[i] = m;
    }
  }

  // Adaptive thresholds from magnitude distribution
  const nonZero: number[] = [];
  for (let i = 0; i < nms.length; i += 3) if (nms[i] > 0) nonZero.push(nms[i]);
  nonZero.sort((a, b) => a - b);
  const pct = (p: number) => (nonZero.length ? nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * p))] : 0);
  const high = Math.max(40, pct(0.9));
  const low = Math.max(15, high * 0.4);

  const edges = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) { edges[i] = 255; stack.push(i); }
  }
  // Hysteresis flood
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!edges[ni] && nms[ni] >= low) { edges[ni] = 255; stack.push(ni); }
      }
    }
  }
  return edges;
}

/** Morphological closing (dilate then erode) to bridge broken document borders. */
export function morphClose(edges: Uint8Array, w: number, h: number, radius = 1): Uint8Array {
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -radius; dy <= radius && !v; dy++) {
        for (let dx = -radius; dx <= radius && !v; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (edges[ny * w + nx]) v = 255;
        }
      }
      dil[y * w + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 255;
      for (let dy = -radius; dy <= radius && v; dy++) {
        for (let dx = -radius; dx <= radius && v; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const ny = Math.min(h - 1, Math.max(0, y + dy));
          if (!dil[ny * w + nx]) v = 0;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

// ─── Hough line transform ────────────────────────────────────────────────────

interface Line {
  rho: number;
  theta: number; // radians, 0..PI
  votes: number;
}

function houghLines(edges: Uint8Array, w: number, h: number): Line[] {
  const thetaSteps = 180;
  const dTheta = Math.PI / thetaSteps;
  const diag = Math.ceil(Math.hypot(w, h));
  const rhoOffset = diag;
  const rhoSize = diag * 2 + 1;
  const acc = new Int32Array(thetaSteps * rhoSize);
  const cosT = new Float32Array(thetaSteps);
  const sinT = new Float32Array(thetaSteps);
  for (let t = 0; t < thetaSteps; t++) {
    cosT[t] = Math.cos(t * dTheta);
    sinT[t] = Math.sin(t * dTheta);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!edges[y * w + x]) continue;
      for (let t = 0; t < thetaSteps; t++) {
        const r = Math.round(x * cosT[t] + y * sinT[t]) + rhoOffset;
        acc[t * rhoSize + r]++;
      }
    }
  }

  // Peak picking with local suppression
  const minVotes = Math.max(20, Math.round(Math.min(w, h) * 0.18));
  const peaks: Line[] = [];
  for (let t = 0; t < thetaSteps; t++) {
    for (let r = 1; r < rhoSize - 1; r++) {
      const v = acc[t * rhoSize + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -2; dt <= 2 && isMax; dt++) {
        for (let dr = -6; dr <= 6 && isMax; dr++) {
          const tt = (t + dt + thetaSteps) % thetaSteps;
          const rr = r + dr;
          if (rr < 0 || rr >= rhoSize) continue;
          if (acc[tt * rhoSize + rr] > v) isMax = false;
        }
      }
      if (isMax) peaks.push({ rho: r - rhoOffset, theta: t * dTheta, votes: v });
    }
  }
  peaks.sort((a, b) => b.votes - a.votes);
  return peaks;
}

function normalizeLine(l: Line): Line {
  // Keep theta in [0, PI); flip rho sign accordingly
  let { rho, theta } = l;
  while (theta < 0) { theta += Math.PI; rho = -rho; }
  while (theta >= Math.PI) { theta -= Math.PI; rho = -rho; }
  return { rho, theta, votes: l.votes };
}

function intersect(a: Line, b: Line): Point | null {
  const ca = Math.cos(a.theta), sa = Math.sin(a.theta);
  const cb = Math.cos(b.theta), sb = Math.sin(b.theta);
  const det = ca * sb - sa * cb;
  if (Math.abs(det) < 1e-6) return null;
  return {
    x: (a.rho * sb - b.rho * sa) / det,
    y: (ca * b.rho - cb * a.rho) / det,
  };
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

export function quadPoints(q: Quad): Point[] {
  return [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
}

export function quadArea(q: Quad): number {
  const p = quadPoints(q);
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Order 4 arbitrary points as TL, TR, BR, BL (angle around centroid). */
export function orderCorners(pts: Point[]): Quad {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
  // sorted is CCW-ish starting from angle -PI; rotate so first point is top-left-most
  let startIdx = 0;
  let best = Infinity;
  sorted.forEach((p, i) => {
    const d = p.x + p.y;
    if (d < best) { best = d; startIdx = i; }
  });
  const ordered = [
    sorted[startIdx],
    sorted[(startIdx + 1) % 4],
    sorted[(startIdx + 2) % 4],
    sorted[(startIdx + 3) % 4],
  ];
  // Ensure clockwise order (TL -> TR -> BR -> BL) in image coords
  const cross =
    (ordered[1].x - ordered[0].x) * (ordered[2].y - ordered[0].y) -
    (ordered[1].y - ordered[0].y) * (ordered[2].x - ordered[0].x);
  const cw = cross > 0 ? ordered : [ordered[0], ordered[3], ordered[2], ordered[1]];
  return { topLeft: cw[0], topRight: cw[1], bottomRight: cw[2], bottomLeft: cw[3] };
}

function isConvex(q: Quad): boolean {
  const p = quadPoints(q);
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-6) return false;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function cornerAngles(q: Quad): number[] {
  const p = quadPoints(q);
  return p.map((_, i) => {
    const prev = p[(i + 3) % 4], cur = p[i], next = p[(i + 1) % 4];
    const v1 = { x: prev.x - cur.x, y: prev.y - cur.y };
    const v2 = { x: next.x - cur.x, y: next.y - cur.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
    if (m === 0) return 0;
    return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
  });
}

export function sideLengths(q: Quad) {
  const topWidth = Math.hypot(q.topRight.x - q.topLeft.x, q.topRight.y - q.topLeft.y);
  const bottomWidth = Math.hypot(q.bottomRight.x - q.bottomLeft.x, q.bottomRight.y - q.bottomLeft.y);
  const leftHeight = Math.hypot(q.bottomLeft.x - q.topLeft.x, q.bottomLeft.y - q.topLeft.y);
  const rightHeight = Math.hypot(q.bottomRight.x - q.topRight.x, q.bottomRight.y - q.topRight.y);
  return { topWidth, bottomWidth, leftHeight, rightHeight };
}

function validateQuad(q: Quad, w: number, h: number): boolean {
  const pts = quadPoints(q);
  // corners inside a small tolerance of frame
  const tol = Math.max(w, h) * 0.05;
  for (const p of pts) {
    if (!isFinite(p.x) || !isFinite(p.y)) return false;
    if (p.x < -tol || p.y < -tol || p.x > w + tol || p.y > h + tol) return false;
  }
  // no duplicate / near-duplicate corners
  const minDist = Math.min(w, h) * 0.05;
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < minDist) return false;
    }
  }
  if (!isConvex(q)) return false;
  const angles = cornerAngles(q);
  if (angles.some((a) => a < MIN_CORNER_ANGLE || a > MAX_CORNER_ANGLE)) return false;

  const { topWidth, bottomWidth, leftHeight, rightHeight } = sideLengths(q);
  const minSide = Math.min(topWidth, bottomWidth, leftHeight, rightHeight);
  if (minSide < Math.min(w, h) * MIN_SIDE_RATIO) return false;
  // opposite sides shouldn't differ wildly (extreme perspective)
  if (Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth) < 0.5) return false;
  if (Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight) < 0.5) return false;

  const aspect = Math.max(topWidth, bottomWidth) / Math.max(1, Math.max(leftHeight, rightHeight));
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return false;

  const ratio = quadArea(q) / (w * h);
  if (ratio < MIN_AREA_RATIO || ratio > MAX_AREA_RATIO) return false;

  return true;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function edgeSupport(q: Quad, edges: Uint8Array, w: number, h: number): number {
  const pts = quadPoints(q);
  const band = 3;
  const perSide: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const samples = Math.max(12, Math.min(200, Math.round(len / 2)));
    // perpendicular unit vector
    const ux = (b.x - a.x) / (len || 1);
    const uy = (b.y - a.y) / (len || 1);
    const px = -uy, py = ux;
    let hits = 0;
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      const sx = a.x + t * (b.x - a.x);
      const sy = a.y + t * (b.y - a.y);
      let found = false;
      for (let d = -band; d <= band && !found; d++) {
        const cx = Math.round(sx + px * d);
        const cy = Math.round(sy + py * d);
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
        if (edges[cy * w + cx]) found = true;
      }
      if (found) hits++;
    }
    perSide.push(hits / (samples + 1));
  }
  const avg = perSide.reduce((s, v) => s + v, 0) / 4;
  const worst = Math.min(...perSide);
  return avg * 0.7 + worst * 0.3;
}

function contrastSupport(q: Quad, pixels: Uint8ClampedArray, w: number, h: number): number {
  const pts = quadPoints(q);
  const off = Math.max(4, Math.round(Math.min(w, h) * 0.02));
  let sum = 0, n = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    let px = -uy, py = ux;
    // point inward: toward centroid
    const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
    const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if ((cx - mx) * px + (cy - my) * py < 0) { px = -px; py = -py; }
    for (let s = 1; s < 8; s++) {
      const t = s / 8;
      const sx = a.x + t * (b.x - a.x);
      const sy = a.y + t * (b.y - a.y);
      const ix = Math.round(sx + px * off), iy = Math.round(sy + py * off);
      const ox = Math.round(sx - px * off), oy = Math.round(sy - py * off);
      if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
      if (ox < 0 || oy < 0 || ox >= w || oy >= h) continue;
      const ii = (iy * w + ix) * 4, oi = (oy * w + ox) * 4;
      sum += Math.hypot(
        pixels[ii] - pixels[oi],
        pixels[ii + 1] - pixels[oi + 1],
        pixels[ii + 2] - pixels[oi + 2]
      );
      n++;
    }
  }
  if (!n) return 0.4;
  return Math.max(0, Math.min(1, sum / n / 110));
}

function scoreCandidate(
  q: Quad,
  edges: Uint8Array,
  pixels: Uint8ClampedArray,
  w: number,
  h: number
): DocumentCandidate {
  const support = edgeSupport(q, edges, w, h);
  const contrast = contrastSupport(q, pixels, w, h);
  const areaRatio = quadArea(q) / (w * h);
  const areaScore = Math.max(0, Math.min(1, 1 - Math.abs(areaRatio - 0.55) / 0.55));

  const cx = quadPoints(q).reduce((s, p) => s + p.x, 0) / 4;
  const cy = quadPoints(q).reduce((s, p) => s + p.y, 0) / 4;
  const dist = Math.hypot(cx - w / 2, cy - h / 2) / Math.hypot(w, h);
  const centerScore = Math.max(0, 1 - dist / 0.35);

  const angles = cornerAngles(q);
  const rectScore = Math.max(0, 1 - angles.reduce((s, a) => s + Math.abs(a - 90), 0) / 4 / 25);

  const score =
    support * 0.42 + contrast * 0.18 + areaScore * 0.15 + centerScore * 0.10 + rectScore * 0.15;

  return {
    quad: q,
    score,
    confidence: Math.max(0, Math.min(1, score * 0.9 + support * 0.1)),
    areaRatio,
    edgeSupport: support,
  };
}

// ─── Public: candidate detection ─────────────────────────────────────────────

export function detectDocumentCandidates(
  imageData: ImageData,
  w: number,
  h: number
): DocumentCandidate[] {
  const gray = gaussianBlur(toGrayscale(imageData.data, w, h), w, h);
  const edges = morphClose(cannyEdges(gray, w, h), w, h, 1);

  const lines = houghLines(edges, w, h).map(normalizeLine);

  // Split into "mostly horizontal" (theta near 90deg) and "mostly vertical"
  const horiz: Line[] = [];
  const vert: Line[] = [];
  for (const l of lines) {
    const deg = (l.theta * 180) / Math.PI;
    if (deg > 55 && deg < 125) horiz.push(l);
    else vert.push(l);
    if (horiz.length >= 9 && vert.length >= 9) break;
  }
  const H = horiz.slice(0, 9);
  const V = vert.slice(0, 9);

  const candidates: DocumentCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < H.length; i++) {
    for (let j = i + 1; j < H.length; j++) {
      for (let k = 0; k < V.length; k++) {
        for (let m = k + 1; m < V.length; m++) {
          const p1 = intersect(H[i], V[k]);
          const p2 = intersect(H[i], V[m]);
          const p3 = intersect(H[j], V[m]);
          const p4 = intersect(H[j], V[k]);
          if (!p1 || !p2 || !p3 || !p4) continue;
          const quad = orderCorners([p1, p2, p3, p4]);
          if (!validateQuad(quad, w, h)) continue;
          const key = quadPoints(quad)
            .map((p) => `${Math.round(p.x / 8)},${Math.round(p.y / 8)}`)
            .join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push(scoreCandidate(quad, edges, imageData.data, w, h));
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    const fb = colorContrastCandidate(imageData.data, edges, w, h);
    if (fb) candidates.push(fb);
  }

  return candidates.slice(0, MAX_CANDIDATES);
}

/** Fallback when no lines were found: largest foreground-vs-corner-background region. */
function colorContrastCandidate(
  pixels: Uint8ClampedArray,
  edges: Uint8Array,
  w: number,
  h: number
): DocumentCandidate | null {
  const s = Math.floor(Math.min(w, h) * 0.08);
  const corners = [[0, 0], [w - s, 0], [0, h - s], [w - s, h - s]];
  let br = 0, bg = 0, bb = 0, bc = 0;
  for (const [sx, sy] of corners) {
    for (let y = sy; y < sy + s && y < h; y++) {
      for (let x = sx; x < sx + s && x < w; x++) {
        const i = (y * w + x) * 4;
        br += pixels[i]; bg += pixels[i + 1]; bb += pixels[i + 2]; bc++;
      }
    }
  }
  if (!bc) return null;
  br /= bc; bg /= bc; bb /= bc;

  const fg: Point[] = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const d = Math.hypot(pixels[i] - br, pixels[i + 1] - bg, pixels[i + 2] - bb);
      if (d > 34) fg.push({ x, y });
    }
  }
  if (fg.length < 200) return null;

  // Extreme points of the foreground set (rotated-rect style, NOT a bbox):
  // pick the points that maximise x+y, x-y, -x-y, -x+y.
  let tl = fg[0], tr = fg[0], br2 = fg[0], bl = fg[0];
  for (const p of fg) {
    if (p.x + p.y < tl.x + tl.y) tl = p;
    if (p.x - p.y > tr.x - tr.y) tr = p;
    if (p.x + p.y > br2.x + br2.y) br2 = p;
    if (p.y - p.x > bl.y - bl.x) bl = p;
  }
  const quad = orderCorners([tl, tr, br2, bl]);
  if (!validateQuad(quad, w, h)) return null;
  const c = scoreCandidate(quad, edges, pixels, w, h);
  return { ...c, score: c.score * 0.75, confidence: c.confidence * 0.7 };
}

// ─── True 4-point perspective warp (homography) ──────────────────────────────

/** Solve an n x n linear system by gaussian elimination. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-9) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i][i === i ? i : i]);
}

/**
 * Homography mapping destination (flat rect) -> source (quad in original image).
 * Returns 9 coefficients (h22 = 1).
 */
function computeHomography(dst: Point[], src: Point[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = dst[i];
    const { x: u, y: v } = src[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  const h = solve(A, b);
  if (!h) return null;
  return [...h, 1];
}

export interface WarpResult {
  data: ImageData;
  width: number;
  height: number;
}

/**
 * Perspective-correct the quad region out of a full-resolution source image.
 * Output size derives from the quad's own side lengths.
 */
export function perspectiveWarp(
  src: ImageData,
  srcW: number,
  srcH: number,
  quad: Quad
): WarpResult | null {
  const { topWidth, bottomWidth, leftHeight, rightHeight } = sideLengths(quad);
  const outW = Math.round(Math.max(topWidth, bottomWidth));
  const outH = Math.round(Math.max(leftHeight, rightHeight));
  if (outW < 80 || outH < 80) return null;
  if (outW * outH > 40_000_000) return null;

  const dstPts: Point[] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const H = computeHomography(dstPts, quadPoints(quad));
  if (!H) return null;

  const out = new ImageData(outW, outH);
  const sd = src.data;
  const od = out.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = H[6] * x + H[7] * y + H[8];
      if (Math.abs(w) < 1e-9) continue;
      const sx = (H[0] * x + H[1] * y + H[2]) / w;
      const sy = (H[3] * x + H[4] * y + H[5]) / w;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= srcW || y0 >= srcH) continue;
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const fx = sx - x0, fy = sy - y0;
      const di = (y * outW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v00 = sd[(y0 * srcW + x0) * 4 + c];
        const v10 = sd[(y0 * srcW + x1) * 4 + c];
        const v01 = sd[(y1 * srcW + x0) * 4 + c];
        const v11 = sd[(y1 * srcW + x1) * 4 + c];
        od[di + c] =
          v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
      }
      od[di + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

// ─── Crop validation ─────────────────────────────────────────────────────────

export interface CropValidation {
  valid: boolean;
  reason?: string;
}

export function validateCrop(
  result: WarpResult,
  quad: Quad,
  srcW: number,
  srcH: number
): CropValidation {
  const { width, height, data } = result;
  if (width <= 0 || height <= 0) return { valid: false, reason: 'zero dimensions' };
  if (width < 200 || height < 200) return { valid: false, reason: 'insufficient resolution' };

  const aspect = width / height;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return { valid: false, reason: 'invalid aspect' };

  const ratio = quadArea(quad) / (srcW * srcH);
  if (ratio < MIN_AREA_RATIO) return { valid: false, reason: 'crop too small' };

  // major clipping: fraction of untouched (fully transparent) output pixels
  let empty = 0, sampled = 0;
  for (let i = 3; i < data.data.length; i += 4 * 37) {
    if (data.data[i] === 0) empty++;
    sampled++;
  }
  if (sampled && empty / sampled > 0.02) return { valid: false, reason: 'clipped output' };

  // degenerate content: near-uniform crop means we grabbed background
  let min = 255, max = 0;
  for (let i = 0; i < data.data.length; i += 4 * 53) {
    const v = (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max - min < 18) return { valid: false, reason: 'uniform / empty content' };

  return { valid: true };
}
