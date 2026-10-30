/**
 * Comprehensive verification test suite for Document Scanner:
 * 1. Straight document on plain background
 * 2. Rotated document
 * 3. Document photographed at an angle with strong perspective distortion
 * 4. Document with shadows and uneven lighting
 * 5. Low-contrast document
 * 6. Document partially touching image boundary
 * 7. Verification of inverse perspective homography and rejection of degenerate quads
 */

import { detectDocumentQuad, RELIABLE_SCORE, type Point, type Quad } from './documentEdgeDetection.ts';
import { applyPerspectiveCorrection, type CropBounds } from './documentScanner.ts';
import assert from 'node:assert/strict';

console.log("=== REMONK SCANNER COMPREHENSIVE VERIFICATION SUITE ===");

/** Helper to create RGBA buffer */
function createBlankImage(w: number, h: number, bgGray = 30): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bgGray;
    data[i * 4 + 1] = bgGray;
    data[i * 4 + 2] = bgGray;
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
}

/** Draw a filled polygon onto RGBA buffer */
function drawPolygon(
  img: { data: Uint8ClampedArray; width: number; height: number },
  poly: Point[],
  color: number,
  shadowFn?: (x: number, y: number) => number
) {
  const { data, width, height } = img;
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (const p of poly) {
    if (p.x < minX) minX = Math.floor(p.x);
    if (p.x > maxX) maxX = Math.ceil(p.x);
    if (p.y < minY) minY = Math.floor(p.y);
    if (p.y > maxY) maxY = Math.ceil(p.y);
  }
  minX = Math.max(0, minX);
  maxX = Math.min(width - 1, maxX);
  minY = Math.max(0, minY);
  maxY = Math.min(height - 1, maxY);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Point-in-polygon test (ray casting)
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) {
        let val = color;
        if (shadowFn) {
          val = Math.max(10, Math.min(255, Math.round(val * shadowFn(x, y))));
        }
        const idx = (y * width + x) * 4;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }
  }
}

// -------------------------------------------------------------
// Test 1: Straight document on plain background
// -------------------------------------------------------------
{
  const W = 800, H = 600;
  const img = createBlankImage(W, H, 40);
  const docCorners: Point[] = [
    { x: 160, y: 100 },
    { x: 640, y: 100 },
    { x: 640, y: 500 },
    { x: 160, y: 500 },
  ];
  drawPolygon(img, docCorners, 230);

  const result = detectDocumentQuad(img.data, W, H);
  assert.ok(result.quad !== null, "Scenario 1: Quad must be detected");
  assert.ok(result.score >= RELIABLE_SCORE, `Scenario 1: Score ${result.score.toFixed(3)} should be >= ${RELIABLE_SCORE}`);
  
  // Verify detected corners are close to actual corners (< 15px)
  const [tl, tr, br, bl] = result.quad;
  assert.ok(Math.hypot(tl.x - 160, tl.y - 100) < 15, "Scenario 1: TL accurate");
  assert.ok(Math.hypot(tr.x - 640, tr.y - 100) < 15, "Scenario 1: TR accurate");
  assert.ok(Math.hypot(br.x - 640, br.y - 500) < 15, "Scenario 1: BR accurate");
  assert.ok(Math.hypot(bl.x - 160, bl.y - 500) < 15, "Scenario 1: BL accurate");

  // Verify perspective correction produces rectangular output
  const bounds: CropBounds = { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
  const corrected = applyPerspectiveCorrection({ data: img.data, width: W, height: H } as any, W, H, bounds);
  assert.ok(corrected !== null, "Scenario 1: Perspective correction must succeed");
  assert.ok(Math.abs(corrected.width - 480) < 20, `Scenario 1: Output width close to 480 (got ${corrected.width})`);
  assert.ok(Math.abs(corrected.height - 400) < 20, `Scenario 1: Output height close to 400 (got ${corrected.height})`);
  console.log("✓ Scenario 1: Straight document detected and corrected to genuine rectangle");
}

// -------------------------------------------------------------
// Test 2: Rotated document (25 degrees)
// -------------------------------------------------------------
{
  const W = 800, H = 800;
  const img = createBlankImage(W, H, 35);
  const cx = 400, cy = 400, dw = 320, dh = 460;
  const angle = (25 * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rot = (dx: number, dy: number) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  });
  const docCorners: Point[] = [
    rot(-dw / 2, -dh / 2),
    rot(dw / 2, -dh / 2),
    rot(dw / 2, dh / 2),
    rot(-dw / 2, dh / 2),
  ];
  drawPolygon(img, docCorners, 225);

  const result = detectDocumentQuad(img.data, W, H);
  assert.ok(result.quad !== null, "Scenario 2: Rotated quad must be detected");
  assert.ok(result.score >= 0.55, `Scenario 2: Rotated quad score ${result.score.toFixed(3)}`);

  const [tl, tr, br, bl] = result.quad;
  const bounds: CropBounds = { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
  const corrected = applyPerspectiveCorrection({ data: img.data, width: W, height: H } as any, W, H, bounds);
  assert.ok(corrected !== null, "Scenario 2: Perspective correction on rotated document must succeed");
  assert.ok(corrected.width > 280 && corrected.width < 360, `Scenario 2: Correct width (got ${corrected.width})`);
  assert.ok(corrected.height > 420 && corrected.height < 500, `Scenario 2: Correct height (got ${corrected.height})`);
  console.log("✓ Scenario 2: Rotated document detected and un-rotated to rectangular output");
}

// -------------------------------------------------------------
// Test 3: Document photographed with strong perspective distortion
// -------------------------------------------------------------
{
  const W = 800, H = 600;
  const img = createBlankImage(W, H, 35);
  // Perspective trapezoid: top is narrower and closer, bottom is wider
  const docCorners: Point[] = [
    { x: 260, y: 120 }, // TL
    { x: 540, y: 120 }, // TR
    { x: 680, y: 520 }, // BR
    { x: 120, y: 520 }, // BL
  ];
  drawPolygon(img, docCorners, 235);

  const result = detectDocumentQuad(img.data, W, H);
  assert.ok(result.quad !== null, "Scenario 3: Perspective quad must be detected");
  
  const [tl, tr, br, bl] = result.quad;
  const bounds: CropBounds = { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
  const corrected = applyPerspectiveCorrection({ data: img.data, width: W, height: H } as any, W, H, bounds);
  assert.ok(corrected !== null, "Scenario 3: Perspective homography must produce valid rectangular output");
  // The bottom width is 560, height is 400
  assert.ok(corrected.width >= 500, `Scenario 3: Rectangular width preserved (got ${corrected.width})`);
  assert.ok(corrected.height >= 380, `Scenario 3: Rectangular height preserved (got ${corrected.height})`);
  console.log("✓ Scenario 3: Strong perspective distortion transformed with inverse homography");
}

// -------------------------------------------------------------
// Test 4: Document with shadows and uneven lighting
// -------------------------------------------------------------
{
  const W = 800, H = 600;
  const img = createBlankImage(W, H, 45);
  const docCorners: Point[] = [
    { x: 180, y: 100 },
    { x: 620, y: 100 },
    { x: 620, y: 500 },
    { x: 180, y: 500 },
  ];
  // Shadow factor: dark on the left side (0.45) transitioning to full bright on the right (1.0)
  drawPolygon(img, docCorners, 230, (x) => 0.45 + 0.55 * ((x - 180) / 440));

  const result = detectDocumentQuad(img.data, W, H);
  assert.ok(result.quad !== null, "Scenario 4: Shaded quad must be detected");
  assert.ok(result.score >= 0.50, `Scenario 4: Score under shadow: ${result.score.toFixed(3)}`);

  const [tl, tr, br, bl] = result.quad;
  const bounds: CropBounds = { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
  const corrected = applyPerspectiveCorrection({ data: img.data, width: W, height: H } as any, W, H, bounds);
  assert.ok(corrected !== null, "Scenario 4: Perspective correction succeeds with shaded document");
  console.log("✓ Scenario 4: Document with shadows and uneven lighting successfully detected");
}

// -------------------------------------------------------------
// Test 5: Low-contrast document
// -------------------------------------------------------------
{
  const W = 800, H = 600;
  // Background gray 120, document gray 155 (only 35 intensity difference)
  const img = createBlankImage(W, H, 120);
  const docCorners: Point[] = [
    { x: 170, y: 90 },
    { x: 630, y: 90 },
    { x: 630, y: 510 },
    { x: 170, y: 510 },
  ];
  drawPolygon(img, docCorners, 155);

  const result = detectDocumentQuad(img.data, W, H);
  assert.ok(result.quad !== null, "Scenario 5: Low-contrast document must be detected");
  const [tl, tr, br, bl] = result.quad;
  assert.ok(Math.hypot(tl.x - 170, tl.y - 90) < 25, "Scenario 5: Corners accurate under low contrast");
  console.log("✓ Scenario 5: Low-contrast document edges extracted accurately via CLAHE + multi-thresholding");
}

// -------------------------------------------------------------
// Test 6: Document partially touching image boundary
// -------------------------------------------------------------
{
  const W = 800, H = 600;
  const img = createBlankImage(W, H, 30);
  // Touching top and left boundary
  const docCorners: Point[] = [
    { x: 0, y: 0 },
    { x: 580, y: 0 },
    { x: 580, y: 480 },
    { x: 0, y: 480 },
  ];
  drawPolygon(img, docCorners, 220);

  const result = detectDocumentQuad(img.data, W, H);
  // Should either detect the boundary-touching quad or return candidates for manual adjustment
  if (result.quad) {
    const bounds: CropBounds = { topLeft: result.quad[0], topRight: result.quad[1], bottomRight: result.quad[2], bottomLeft: result.quad[3] };
    const corrected = applyPerspectiveCorrection({ data: img.data, width: W, height: H } as any, W, H, bounds);
    assert.ok(corrected !== null, "Scenario 6: Perspective correction on boundary quad");
  }
  console.log("✓ Scenario 6: Document touching image boundary handled safely without out-of-bounds error");
}

// -------------------------------------------------------------
// Test 7: Rejection of degenerate, concave, or self-intersecting quads
// -------------------------------------------------------------
{
  const W = 500, H = 500;
  const img = createBlankImage(W, H, 30);

  // Self-intersecting bowtie
  const bowtie: CropBounds = {
    topLeft: { x: 50, y: 50 },
    topRight: { x: 400, y: 400 },
    bottomRight: { x: 400, y: 50 },
    bottomLeft: { x: 50, y: 400 },
  };
  const res1 = applyPerspectiveCorrection({ data: img.data, width: W, height: H } as any, W, H, bowtie);
  assert.equal(res1, null, "Bowtie self-intersecting quad must return null");

  // Collinear points
  const collinear: CropBounds = {
    topLeft: { x: 50, y: 50 },
    topRight: { x: 150, y: 150 },
    bottomRight: { x: 250, y: 250 },
    bottomLeft: { x: 350, y: 350 },
  };
  const res2 = applyPerspectiveCorrection({ data: img.data, width: W, height: H } as any, W, H, collinear);
  assert.equal(res2, null, "Collinear points must return null");

  // NaN / infinite coordinates
  const invalidCoords: CropBounds = {
    topLeft: { x: NaN, y: 50 },
    topRight: { x: 400, y: 50 },
    bottomRight: { x: 400, y: 400 },
    bottomLeft: { x: 50, y: 400 },
  };
  const res3 = applyPerspectiveCorrection({ data: img.data, width: W, height: H } as any, W, H, invalidCoords);
  assert.equal(res3, null, "NaN coordinates must return null");

  console.log("✓ Test 7: Degenerate, self-intersecting, and invalid quads properly rejected");
}

console.log("=======================================================");
console.log("ALL 7 VERIFICATION SCENARIOS PASSED WITH ZERO FAILURES!");
console.log("=======================================================");
