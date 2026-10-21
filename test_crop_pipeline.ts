import { detectDocumentQuad, RELIABLE_SCORE } from './src/utils/documentEdgeDetection.ts';

function createBlank(w: number, h: number, color: [number, number, number]) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = color[0];
    buf[i + 1] = color[1];
    buf[i + 2] = color[2];
    buf[i + 3] = 255;
  }
  return buf;
}

function drawPolygon(buf: Uint8ClampedArray, w: number, h: number, pts: { x: number; y: number }[], color: [number, number, number]) {
  let minY = h, maxY = 0;
  for (const p of pts) {
    if (p.y < minY) minY = Math.floor(p.y);
    if (p.y > maxY) maxY = Math.ceil(p.y);
  }
  minY = Math.max(0, minY);
  maxY = Math.min(h - 1, maxY);

  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
        const x = p1.x + ((y - p1.y) * (p2.x - p1.x)) / (p2.y - p1.y);
        intersections.push(x);
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i < intersections.length; i += 2) {
      const x1 = Math.max(0, Math.ceil(intersections[i]));
      const x2 = Math.min(w - 1, Math.floor(intersections[i + 1]));
      for (let x = x1; x <= x2; x++) {
        const idx = (y * w + x) * 4;
        buf[idx] = color[0];
        buf[idx + 1] = color[1];
        buf[idx + 2] = color[2];
      }
    }
  }
}

function addTextLines(buf: Uint8ClampedArray, w: number, h: number, pts: { x: number; y: number }[]) {
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  for (let y = minY + 30; y < maxY - 30; y += 25) {
    for (let x = minX + 20; x < maxX - 20; x++) {
      if (x % 15 < 10) {
        const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
        buf[idx] = 40;
        buf[idx + 1] = 40;
        buf[idx + 2] = 40;
      }
    }
  }
}

let passed = 0;
let total = 0;

function assert(cond: boolean, msg: string) {
  total++;
  if (cond) {
    console.log('  ✓ PASS:', msg);
    passed++;
  } else {
    console.error('  ✗ FAIL:', msg);
  }
}

console.log('--- Running Auto-Crop Pipeline Acceptance Test Suite ---');

// Test 1: Flat document (white document on dark desk)
{
  const w = 800, h = 600;
  const buf = createBlank(w, h, [45, 50, 55]);
  const quad = [{ x: 150, y: 100 }, { x: 650, y: 100 }, { x: 650, y: 500 }, { x: 150, y: 500 }];
  drawPolygon(buf, w, h, quad, [240, 240, 245]);
  addTextLines(buf, w, h, quad);
  const res = detectDocumentQuad(buf, w, h);
  assert(res.reliable && res.score >= RELIABLE_SCORE, 'Flat document detected as reliable (score=' + res.score.toFixed(2) + ')');
  assert(res.quad && Math.abs(res.quad[0].x - 150) < 20 && Math.abs(res.quad[0].y - 100) < 20, 'Flat document corners accurately located');
}

// Test 2: Tilted / perspective skewed document
{
  const w = 800, h = 600;
  const buf = createBlank(w, h, [50, 45, 40]);
  const quad = [{ x: 200, y: 120 }, { x: 680, y: 160 }, { x: 620, y: 520 }, { x: 140, y: 460 }];
  drawPolygon(buf, w, h, quad, [235, 235, 240]);
  addTextLines(buf, w, h, quad);
  const res = detectDocumentQuad(buf, w, h);
  assert(res.reliable && res.score >= RELIABLE_SCORE, 'Tilted document detected as reliable (score=' + res.score.toFixed(2) + ')');
  assert(res.quad && Math.abs(res.quad[0].x - 200) < 25 && Math.abs(res.quad[0].y - 120) < 25, 'Tilted document corners accurately bounded');
}

// Test 3: Rotated / portrait document
{
  const w = 600, h = 900;
  const buf = createBlank(w, h, [60, 60, 65]);
  const quad = [{ x: 80, y: 100 }, { x: 520, y: 100 }, { x: 520, y: 800 }, { x: 80, y: 800 }];
  drawPolygon(buf, w, h, quad, [245, 245, 240]);
  addTextLines(buf, w, h, quad);
  const res = detectDocumentQuad(buf, w, h);
  assert(res.reliable && res.score >= RELIABLE_SCORE, 'Portrait document detected as reliable (score=' + res.score.toFixed(2) + ')');
  assert(res.quad && Math.abs(res.quad[0].x - 80) < 20 && Math.abs(res.quad[2].y - 800) < 20, 'Portrait document corners match boundaries');
}

// Test 4: Low-light image (noisy, low contrast)
{
  const w = 800, h = 600;
  const buf = createBlank(w, h, [40, 40, 40]);
  const quad = [{ x: 160, y: 120 }, { x: 640, y: 120 }, { x: 640, y: 480 }, { x: 160, y: 480 }];
  drawPolygon(buf, w, h, quad, [75, 75, 78]);
  for (let i = 0; i < buf.length; i += 4) {
    const noise = (Math.random() - 0.5) * 8;
    buf[i] = Math.max(0, Math.min(255, buf[i] + noise));
    buf[i + 1] = Math.max(0, Math.min(255, buf[i + 1] + noise));
    buf[i + 2] = Math.max(0, Math.min(255, buf[i + 2] + noise));
  }
  const res = detectDocumentQuad(buf, w, h);
  assert(res.quad !== null, 'Low light document produces bounding quad');
}

// Test 5: Document with shadows across it
{
  const w = 800, h = 600;
  const buf = createBlank(w, h, [50, 50, 50]);
  const quad = [{ x: 150, y: 100 }, { x: 650, y: 100 }, { x: 650, y: 500 }, { x: 150, y: 500 }];
  drawPolygon(buf, w, h, quad, [240, 240, 240]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const shadowFactor = 0.4 + 0.6 * ((x + y) / (w + h));
      const idx = (y * w + x) * 4;
      buf[idx] = Math.round(buf[idx] * shadowFactor);
      buf[idx + 1] = Math.round(buf[idx + 1] * shadowFactor);
      buf[idx + 2] = Math.round(buf[idx + 2] * shadowFactor);
    }
  }
  const res = detectDocumentQuad(buf, w, h);
  assert(res.reliable && res.score >= RELIABLE_SCORE, 'Document with non-uniform shadow detected as reliable (score=' + res.score.toFixed(2) + ')');
  assert(res.quad && Math.abs(res.quad[0].x - 150) < 25 && Math.abs(res.quad[2].y - 500) < 25, 'Shadowed document corners preserved');
}

// Test 6: No reliable boundary (uniform / textured background without document)
{
  const w = 600, h = 600;
  const buf = createBlank(w, h, [120, 120, 120]);
  for (let i = 0; i < buf.length; i += 4) {
    const noise = (Math.random() - 0.5) * 30;
    buf[i] = Math.max(0, Math.min(255, buf[i] + noise));
    buf[i + 1] = Math.max(0, Math.min(255, buf[i + 1] + noise));
    buf[i + 2] = Math.max(0, Math.min(255, buf[i + 2] + noise));
  }
  const res = detectDocumentQuad(buf, w, h);
  assert(!res.reliable, 'Uniform textured background correctly marked as NOT reliable (safe fallback triggered)');
}

// Test 7: Indian Driving Licence on red table with internal lines
{
  const w = 1000, h = 800;
  const buf = createBlank(w, h, [230, 70, 80]);
  const left = 120, right = 880, top = 160, bottom = 640;
  const quad = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
  drawPolygon(buf, w, h, quad, [210, 235, 245]);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (y === top + 70 || y === top + 140) {
        const idx = (y * w + x) * 4;
        buf[idx] = 30;
        buf[idx + 1] = 30;
        buf[idx + 2] = 30;
      }
    }
  }
  addTextLines(buf, w, h, quad);
  const res = detectDocumentQuad(buf, w, h);
  assert(res.reliable && res.score >= RELIABLE_SCORE, 'DL on red background detected as reliable');
  assert(
    res.quad && Math.abs(res.quad[0].y - top) < 30 && Math.abs(res.quad[2].y - bottom) < 30,
    'Top edge of DL NOT cut off by internal lines (detected y=' + (res.quad ? res.quad[0].y.toFixed(0) : 'null') + ', actual=' + top + ')'
  );
}

console.log(`\nTest Results: ${passed}/${total} passed`);
if (passed !== total) process.exit(1);
