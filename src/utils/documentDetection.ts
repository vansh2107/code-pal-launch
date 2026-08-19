/**
 * Multi-stage document boundary detection.
 *
 * Pipeline: grayscale -> 5-tap Gaussian blur -> Canny (adaptive hysteresis)
 * -> morphological close -> Hough line detection -> quadrilateral candidates
 * from horizontal/vertical line pairs -> geometry validation -> multi-signal
 * scoring -> ranked, de-duplicated candidate list (+ colour-contrast fallback).
 *
 * Also exports a true projective homography warp and a post-crop validator.
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

export interface DocumentCandidate {
  corners: Quad;
  score: number;
  confidence: number;
  source: 'hough' | 'contrast';
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

// ─── Stage 1: grayscale ───────────────────────────────────────────────────────

function toGray(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return gray;
}

// ─── Stage 2: separable 5-tap Gaussian blur ───────────────────────────────────

function gaussianBlur5(gray: Uint8Array, width: number, height: number): Uint8Array {
  const k = [1, 4, 6, 4, 1];
  const kSum = 16;
  const tmp = new Float32Array(width * height);
  const out = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let t = -2; t <= 2; t++) {
        const xx = Math.min(width - 1, Math.max(0, x + t));
        sum += gray[row + xx] * k[t + 2];
      }
      tmp[row + x] = sum / kSum;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let t = -2; t <= 2; t++) {
        const yy = Math.min(height - 1, Math.max(0, y + t));
        sum += tmp[yy * width + x] * k[t + 2];
      }
      out[y * width + x] = sum / kSum;
    }
  }
  return out;
}

// ─── Stage 3: Canny with adaptive hysteresis ──────────────────────────────────

function canny(gray: Uint8Array, width: number, height: number): Uint8Array {
  const mag = new Float32Array(width * height);
  const dir = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] + gray[i - width + 1] +
        -2 * gray[i - 1] + 2 * gray[i + 1] +
        -gray[i + width - 1] + gray[i + width + 1];
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      mag[i] = Math.hypot(gx, gy);
      dir[i] = Math.atan2(gy, gx);
    }
  }

  // Non-maximum suppression
  const nms = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const m = mag[i];
      if (m === 0) continue;
      const a = ((dir[i] * 180) / Math.PI + 180) % 180;
      let p: number, q: number;
      if (a < 22.5 || a >= 157.5) {
        p = mag[i + 1]; q = mag[i - 1];
      } else if (a < 67.5) {
        p = mag[i + width - 1]; q = mag[i - width + 1];
      } else if (a < 112.5) {
        p = mag[i + width]; q = mag[i - width];
      } else {
        p = mag[i - width - 1]; q = mag[i + width + 1];
      }
      if (m >= p && m >= q) nms[i] = m;
    }
  }

  // Adaptive hysteresis: high threshold = 85th percentile of non-zero NMS
  const values: number[] = [];
  for (let i = 0; i < nms.length; i += 3) if (nms[i] > 0) values.push(nms[i]);
  values.sort((a, b) => a - b);
  const high = values.length
    ? Math.max(28, values[Math.floor(values.length * 0.85)])
    : 60;
  const low = Math.max(10, high * 0.4);

  const edges = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) {
      edges[i] = 255;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (edges[ni] === 0 && nms[ni] >= low) {
          edges[ni] = 255;
          stack.push(ni);
        }
      }
    }
  }
  return edges;
}

// ─── Stage 4: morphological close (dilate then erode) ─────────────────────────

function morphClose(edges: Uint8Array, width: number, height: number, radius = 1): Uint8Array {
  const dil = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let dy = -radius; dy <= radius && !v; dy++) {
        for (let dx = -radius; dx <= radius && !v; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (edges[ny * width + nx]) v = 255;
        }
      }
      dil[y * width + x] = v;
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 255;
      for (let dy = -radius; dy <= radius && v; dy++) {
        for (let dx = -radius; dx <= radius && v; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          if (!dil[ny * width + nx]) v = 0;
        }
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

// ─── Stage 5: Hough line detection ────────────────────────────────────────────

interface HLine {
  rho: number;
  theta: number; // radians, [0, PI)
  votes: number;
}

function houghLines(
  edges: Uint8Array,
  width: number,
  height: number
): { horizontal: HLine[]; vertical: HLine[] } {
  const thetaSteps = 180; // 1 degree
  const diag = Math.ceil(Math.hypot(width, height));
  const rhoOffset = diag;
  const rhoBins = diag * 2 + 1;
  const acc = new Int32Array(thetaSteps * rhoBins);

  const cosT = new Float32Array(thetaSteps);
  const sinT = new Float32Array(thetaSteps);
  for (let t = 0; t < thetaSteps; t++) {
    const th = (t * Math.PI) / thetaSteps;
    cosT[t] = Math.cos(th);
    sinT[t] = Math.sin(th);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!edges[y * width + x]) continue;
      for (let t = 0; t < thetaSteps; t++) {
        const rho = Math.round(x * cosT[t] + y * sinT[t]) + rhoOffset;
        acc[t * rhoBins + rho]++;
      }
    }
  }

  const minVotes = Math.max(24, Math.round(Math.min(width, height) * 0.18));
  const raw: HLine[] = [];
  for (let t = 0; t < thetaSteps; t++) {
    for (let r = 1; r < rhoBins - 1; r++) {
      const v = acc[t * rhoBins + r];
      if (v < minVotes) continue;
      // local maximum in rho
      if (v < acc[t * rhoBins + r - 1] || v < acc[t * rhoBins + r + 1]) continue;
      raw.push({ rho: r - rhoOffset, theta: (t * Math.PI) / thetaSteps, votes: v });
    }
  }
  raw.sort((a, b) => b.votes - a.votes);

  // Angular classification: horizontal ≈ 90°, vertical ≈ 0°/180°
  const TOL = (35 * Math.PI) / 180;
  const horizontal: HLine[] = [];
  const vertical: HLine[] = [];

  const pushUnique = (arr: HLine[], line: HLine, minRhoSep: number) => {
    for (const l of arr) {
      if (
        Math.abs(l.rho - line.rho) < minRhoSep &&
        Math.abs(l.theta - line.theta) < (12 * Math.PI) / 180
      ) return;
    }
    if (arr.length < 12) arr.push(line);
  };

  const hSep = Math.max(8, height * 0.05);
  const vSep = Math.max(8, width * 0.05);

  for (const l of raw) {
    const dHoriz = Math.abs(l.theta - Math.PI / 2);
    const dVert = Math.min(l.theta, Math.PI - l.theta);
    if (dHoriz <= TOL) pushUnique(horizontal, l, hSep);
    else if (dVert <= TOL) pushUnique(vertical, l, vSep);
  }

  return { horizontal, vertical };
}

function intersect(a: HLine, b: HLine): Point | null {
  const det = Math.cos(a.theta) * Math.sin(b.theta) - Math.sin(a.theta) * Math.cos(b.theta);
  if (Math.abs(det) < 1e-6) return null;
  const x = (a.rho * Math.sin(b.theta) - b.rho * Math.sin(a.theta)) / det;
  const y = (b.rho * Math.cos(a.theta) - a.rho * Math.cos(b.theta)) / det;
  return { x, y };
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function quadPoints(q: Quad): Point[] {
  return [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
}

export function quadArea(q: Quad): number {
  const pts = quadPoints(q);
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function isConvex(q: Quad): boolean {
  const pts = quadPoints(q);
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

function cornerAngles(q: Quad): number[] {
  const pts = quadPoints(q);
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

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function edgeSupport(
  q: Quad,
  edges: Uint8Array,
  width: number,
  height: number
): { avg: number; min: number } {
  const sides: [Point, Point][] = [
    [q.topLeft, q.topRight],
    [q.topRight, q.bottomRight],
    [q.bottomRight, q.bottomLeft],
    [q.bottomLeft, q.topLeft],
  ];
  const band = 3;
  const scores: number[] = [];
  for (const [p1, p2] of sides) {
    const len = dist(p1, p2);
    const samples = Math.max(12, Math.min(120, Math.round(len / 3)));
    // perpendicular unit vector
    const ux = (p2.x - p1.x) / (len || 1);
    const uy = (p2.y - p1.y) / (len || 1);
    const px = -uy, py = ux;
    let hits = 0;
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      const x0 = p1.x + t * (p2.x - p1.x);
      const y0 = p1.y + t * (p2.y - p1.y);
      let found = false;
      for (let d = -band; d <= band && !found; d++) {
        const x = Math.round(x0 + px * d);
        const y = Math.round(y0 + py * d);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (edges[y * width + x]) found = true;
      }
      if (found) hits++;
    }
    scores.push(hits / (samples + 1));
  }
  return {
    avg: scores.reduce((a, b) => a + b, 0) / 4,
    min: Math.min(...scores),
  };
}

function contrastAcrossBorder(
  q: Quad,
  data: Uint8ClampedArray,
  width: number,
  height: number
): number {
  const sides: [Point, Point][] = [
    [q.topLeft, q.topRight],
    [q.topRight, q.bottomRight],
    [q.bottomRight, q.bottomLeft],
    [q.bottomLeft, q.topLeft],
  ];
  const cx = (q.topLeft.x + q.topRight.x + q.bottomLeft.x + q.bottomRight.x) / 4;
  const cy = (q.topLeft.y + q.topRight.y + q.bottomLeft.y + q.bottomRight.y) / 4;
  const off = Math.max(4, Math.round(Math.min(width, height) * 0.01));
  let sum = 0, n = 0;
  const sample = (x: number, y: number) => {
    const xi = Math.min(width - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(height - 1, Math.max(0, Math.round(y)));
    const i = (yi * width + xi) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  for (const [p1, p2] of sides) {
    for (let s = 1; s < 8; s++) {
      const t = s / 8;
      const x0 = p1.x + t * (p2.x - p1.x);
      const y0 = p1.y + t * (p2.y - p1.y);
      let nx = x0 - cx, ny = y0 - cy;
      const m = Math.hypot(nx, ny) || 1;
      nx /= m; ny /= m;
      const inside = sample(x0 - nx * off, y0 - ny * off);
      const outside = sample(x0 + nx * off, y0 + ny * off);
      sum += Math.hypot(
        inside[0] - outside[0],
        inside[1] - outside[1],
        inside[2] - outside[2]
      );
      n++;
    }
  }
  return n ? clamp01(sum / n / 110) : 0.4;
}

const ASPECT_TARGETS = [0.5, 0.63, 0.707, 0.786, 1.0, 1.27, 1.414, 1.586, 2.0];

function scoreCandidate(
  q: Quad,
  edges: Uint8Array,
  data: Uint8ClampedArray,
  width: number,
  height: number
): DocumentCandidate | null {
  if (!isConvex(q)) return null;

  for (const p of quadPoints(q)) {
    if (p.x < -width * 0.05 || p.y < -height * 0.05) return null;
    if (p.x > width * 1.05 || p.y > height * 1.05) return null;
  }

  const angles = cornerAngles(q);
  if (angles.some((a) => a < 55 || a > 125)) return null;

  const area = quadArea(q);
  const areaRatio = area / (width * height);
  if (areaRatio < 0.10 || areaRatio > 0.985) return null;

  const topW = dist(q.topLeft, q.topRight);
  const botW = dist(q.bottomLeft, q.bottomRight);
  const leftH = dist(q.topLeft, q.bottomLeft);
  const rightH = dist(q.topRight, q.bottomRight);
  if (Math.min(topW, botW, leftH, rightH) < Math.min(width, height) * 0.12) return null;

  // Perspective skew: opposite sides shouldn't differ wildly
  const skewW = Math.min(topW, botW) / Math.max(topW, botW);
  const skewH = Math.min(leftH, rightH) / Math.max(leftH, rightH);
  if (skewW < 0.55 || skewH < 0.55) return null;
  const skewScore = clamp01((Math.min(skewW, skewH) - 0.55) / 0.45);

  // Rectangularity: how close corner angles are to 90°
  const angleDev = angles.reduce((s, a) => s + Math.abs(a - 90), 0) / 4;
  const rectScore = clamp01(1 - angleDev / 30);

  const aspect = ((topW + botW) / 2) / Math.max(1, (leftH + rightH) / 2);
  if (aspect < 0.28 || aspect > 3.6) return null;
  let aspectDiff = Infinity;
  for (const t of ASPECT_TARGETS) aspectDiff = Math.min(aspectDiff, Math.abs(aspect - t) / t);
  const aspectScore = clamp01(1 - aspectDiff / 0.6);

  // Border distance: reject frame-sized quads hugging all four image edges
  const margin = Math.max(3, Math.round(Math.min(width, height) * 0.01));
  let touching = 0;
  for (const p of quadPoints(q)) {
    if (p.x <= margin || p.y <= margin || p.x >= width - 1 - margin || p.y >= height - 1 - margin) touching++;
  }
  if (touching === 4 && areaRatio > 0.95) return null;
  const borderScore = clamp01(1 - touching / 5);

  const support = edgeSupport(q, edges, width, height);
  if (support.min < 0.18) return null; // every side must have some evidence
  if (support.avg < 0.30) return null;

  const cxq = (q.topLeft.x + q.topRight.x + q.bottomLeft.x + q.bottomRight.x) / 4;
  const cyq = (q.topLeft.y + q.topRight.y + q.bottomLeft.y + q.bottomRight.y) / 4;
  const centerScore = clamp01(
    1 - Math.hypot(cxq - width / 2, cyq - height / 2) / (Math.hypot(width, height) * 0.45)
  );

  const areaScore = clamp01(1 - Math.abs(areaRatio - 0.55) / 0.5);
  const contrast = contrastAcrossBorder(q, data, width, height);

  // Multi-signal score: area alone can never win.
  const score = clamp01(
    support.avg * 0.30 +
    support.min * 0.12 +
    rectScore * 0.14 +
    skewScore * 0.08 +
    aspectScore * 0.08 +
    contrast * 0.14 +
    centerScore * 0.07 +
    borderScore * 0.04 +
    areaScore * 0.03
  );

  const confidence = clamp01(score * 0.75 + support.min * 0.15 + contrast * 0.10);

  return { corners: q, score, confidence, source: 'hough' };
}

// ─── Colour-contrast fallback candidate ───────────────────────────────────────

function contrastFallback(
  data: Uint8ClampedArray,
  edges: Uint8Array,
  width: number,
  height: number
): DocumentCandidate | null {
  const s = Math.max(4, Math.floor(Math.min(width, height) * 0.08));
  const corners: [number, number][] = [
    [0, 0], [width - s, 0], [0, height - s], [width - s, height - s],
  ];
  let br = 0, bg = 0, bb = 0, cnt = 0;
  for (const [sx, sy] of corners) {
    for (let y = sy; y < sy + s && y < height; y++) {
      for (let x = sx; x < sx + s && x < width; x++) {
        const i = (y * width + x) * 4;
        br += data[i]; bg += data[i + 1]; bb += data[i + 2]; cnt++;
      }
    }
  }
  if (!cnt) return null;
  br /= cnt; bg /= cnt; bb /= cnt;

  let minX = width, maxX = 0, minY = height, maxY = 0, found = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const d = Math.hypot(data[i] - br, data[i + 1] - bg, data[i + 2] - bb);
      if (d > 34) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found++;
      }
    }
  }
  if (found < 50 || maxX - minX < width * 0.2 || maxY - minY < height * 0.2) return null;

  const q: Quad = {
    topLeft: { x: minX, y: minY },
    topRight: { x: maxX, y: minY },
    bottomLeft: { x: minX, y: maxY },
    bottomRight: { x: maxX, y: maxY },
  };
  const areaRatio = quadArea(q) / (width * height);
  if (areaRatio < 0.10 || areaRatio > 0.97) return null;

  const support = edgeSupport(q, edges, width, height);
  const contrast = contrastAcrossBorder(q, data, width, height);
  const score = clamp01(support.avg * 0.35 + contrast * 0.35 + 0.15);
  return { corners: q, score, confidence: clamp01(score * 0.7), source: 'contrast' };
}

// ─── Public: candidate detection ──────────────────────────────────────────────

export function detectDocumentCandidates(
  imageData: ImageData,
  width: number,
  height: number,
  maxCandidates = 5
): DocumentCandidate[] {
  const data = imageData.data;
  const gray = toGray(data, width, height);
  const blurred = gaussianBlur5(gray, width, height);
  const edgeMap = canny(blurred, width, height);
  const closed = morphClose(edgeMap, width, height, 1);

  const { horizontal, vertical } = houghLines(closed, width, height);

  const candidates: DocumentCandidate[] = [];

  for (let a = 0; a < horizontal.length; a++) {
    for (let b = a + 1; b < horizontal.length; b++) {
      for (let c = 0; c < vertical.length; c++) {
        for (let d = c + 1; d < vertical.length; d++) {
          const h1 = horizontal[a], h2 = horizontal[b];
          const v1 = vertical[c], v2 = vertical[d];
          const p11 = intersect(h1, v1);
          const p12 = intersect(h1, v2);
          const p21 = intersect(h2, v1);
          const p22 = intersect(h2, v2);
          if (!p11 || !p12 || !p21 || !p22) continue;

          const pts = [p11, p12, p21, p22];
          // Order: top two by y, then left/right by x
          const sortedY = [...pts].sort((p, q2) => p.y - q2.y);
          const top = [sortedY[0], sortedY[1]].sort((p, q2) => p.x - q2.x);
          const bottom = [sortedY[2], sortedY[3]].sort((p, q2) => p.x - q2.x);
          const quad: Quad = {
            topLeft: top[0],
            topRight: top[1],
            bottomLeft: bottom[0],
            bottomRight: bottom[1],
          };
          const cand = scoreCandidate(quad, closed, data, width, height);
          if (cand) candidates.push(cand);
        }
      }
    }
  }

  const fallback = contrastFallback(data, closed, width, height);
  if (fallback) candidates.push(fallback);

  candidates.sort((a, b) => b.score - a.score);

  // De-duplicate near-identical quads
  const tol = Math.max(6, Math.min(width, height) * 0.03);
  const unique: DocumentCandidate[] = [];
  for (const c of candidates) {
    const dup = unique.some((u) =>
      quadPoints(u.corners).every((p, i) => dist(p, quadPoints(c.corners)[i]) < tol)
    );
    if (!dup) unique.push(c);
    if (unique.length >= maxCandidates) break;
  }
  return unique;
}

// ─── Public: projective homography warp ───────────────────────────────────────

/**
 * Solve the 8x8 linear system for the homography mapping destination
 * (rectangle) coordinates -> source quad coordinates.
 */
function solveHomography(src: Point[], dst: Point[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: X, y: Y } = dst[i]; // from
    const { x, y } = src[i];       // to
    A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]);
    b.push(x);
    A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]);
    b.push(y);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) pivot = r;
    if (Math.abs(A[pivot][i]) < 1e-10) return null;
    [A[i], A[pivot]] = [A[pivot], A[i]];
    [b[i], b[pivot]] = [b[pivot], b[i]];
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      if (!f) continue;
      for (let c2 = i; c2 < n; c2++) A[r][c2] -= f * A[i][c2];
      b[r] -= f * b[i];
    }
  }
  const h: number[] = [];
  for (let i = 0; i < n; i++) h.push(b[i] / A[i][i]);
  h.push(1);
  return h;
}

export function perspectiveWarp(
  srcData: ImageData,
  srcWidth: number,
  srcHeight: number,
  quad: Quad
): { data: ImageData; width: number; height: number } | null {
  const topW = dist(quad.topLeft, quad.topRight);
  const botW = dist(quad.bottomLeft, quad.bottomRight);
  const leftH = dist(quad.topLeft, quad.bottomLeft);
  const rightH = dist(quad.topRight, quad.bottomRight);

  const dstWidth = Math.round(Math.max(topW, botW));
  const dstHeight = Math.round(Math.max(leftH, rightH));
  if (dstWidth < 80 || dstHeight < 80) return null;
  if (dstWidth * dstHeight > 40_000_000) return null;

  const src = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: dstWidth - 1, y: 0 },
    { x: dstWidth - 1, y: dstHeight - 1 },
    { x: 0, y: dstHeight - 1 },
  ];
  const h = solveHomography(src, dst);
  if (!h) return null;

  const out = new ImageData(dstWidth, dstHeight);
  const s = srcData.data;
  const o = out.data;

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const denom = h[6] * x + h[7] * y + h[8];
      const sx = (h[0] * x + h[1] * y + h[2]) / denom;
      const sy = (h[3] * x + h[4] * y + h[5]) / denom;
      const di = (y * dstWidth + x) * 4;

      if (sx < 0 || sy < 0 || sx > srcWidth - 1 || sy > srcHeight - 1) {
        o[di] = 255; o[di + 1] = 255; o[di + 2] = 255; o[di + 3] = 255;
        continue;
      }
      // bilinear sampling
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(srcWidth - 1, x0 + 1);
      const y1 = Math.min(srcHeight - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * srcWidth + x0) * 4;
      const i10 = (y0 * srcWidth + x1) * 4;
      const i01 = (y1 * srcWidth + x0) * 4;
      const i11 = (y1 * srcWidth + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] * (1 - fx) + s[i10 + c] * fx;
        const bot = s[i01 + c] * (1 - fx) + s[i11 + c] * fx;
        o[di + c] = top * (1 - fy) + bot * fy;
      }
      o[di + 3] = 255;
    }
  }
  return { data: out, width: dstWidth, height: dstHeight };
}

// ─── Public: post-crop validation ─────────────────────────────────────────────

export interface CropValidation {
  valid: boolean;
  reason?: string;
  sharpness: number;
  fill: number;
}

/**
 * Sanity-check a warped result: reasonable size/aspect, not blank,
 * and enough detail (variance of Laplacian proxy) to be a document.
 */
export function validateCrop(
  result: ImageData,
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number
): CropValidation {
  const fill = (width * height) / (originalWidth * originalHeight);
  const base: CropValidation = { valid: true, sharpness: 0, fill };

  if (width < 120 || height < 120) {
    return { ...base, valid: false, reason: 'crop-too-small' };
  }
  const aspect = width / height;
  if (aspect < 0.25 || aspect > 4) {
    return { ...base, valid: false, reason: 'implausible-aspect' };
  }
  if (fill < 0.06) {
    return { ...base, valid: false, reason: 'crop-discards-too-much' };
  }

  const gray = toGray(result.data, width, height);
  let mean = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 20000)));
  let n = 0;
  for (let i = 0; i < gray.length; i += step) { mean += gray[i]; n++; }
  mean /= n || 1;

  let variance = 0;
  for (let i = 0; i < gray.length; i += step) {
    const d = gray[i] - mean;
    variance += d * d;
  }
  variance /= n || 1;
  const sharpness = Math.sqrt(variance);

  if (sharpness < 6) {
    return { ...base, sharpness, valid: false, reason: 'blank-or-flat-crop' };
  }
  return { ...base, sharpness };
}
