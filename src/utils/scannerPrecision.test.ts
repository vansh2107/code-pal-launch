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

// -------------------------------------------------------------
// Test 8: Document with bold text, barcode/stripes, and flash glare
// -------------------------------------------------------------
{
  const W = 800, H = 600;
  const img = createBlankImage(W, H, 50);
  const docCorners: Point[] = [
    { x: 120, y: 80 },
    { x: 680, y: 80 },
    { x: 680, y: 520 },
    { x: 120, y: 520 },
  ];
  drawPolygon(img, docCorners, 240);

  // Add bold black text blocks / lines inside document
  for (let y = 140; y < 460; y += 30) {
    for (let x = 160; x < 640; x++) {
      if ((x % 80) < 60) {
        const idx = (y * W + x) * 4;
        img.data[idx] = 10;
        img.data[idx + 1] = 10;
        img.data[idx + 2] = 10;
      }
    }
  }

  // Add specular flash glare (gradient up to 255)
  for (let y = 80; y < 140; y++) {
    for (let x = 600; x < 680; x++) {
      const idx = (y * W + x) * 4;
      img.data[idx] = 255;
      img.data[idx + 1] = 255;
      img.data[idx + 2] = 255;
    }
  }

  const result = detectDocumentQuad(img.data, W, H);
  assert.ok(result.quad !== null, "Scenario 8: Must detect document quad amidst text & glare");
  assert.ok(result.score >= RELIABLE_SCORE, `Scenario 8: Score ${result.score.toFixed(3)} should be >= ${RELIABLE_SCORE}`);
  console.log(`✓ Scenario 8: Document with bold text & specular glare detected with score ${result.score.toFixed(3)} (>= ${RELIABLE_SCORE})`);
}

// -------------------------------------------------------------
// Test 9: Real-world user image regression (PAN card on patterned floral bedsheet)
// -------------------------------------------------------------
{
  import('fs').then(async (fs) => {
    import('zlib').then(async (zlib) => {
      const imgPath = 'C:/Users/VANSH GANDHI/.gemini/antigravity/brain/d950019a-9e4c-41a8-8bc8-43521f0a78f2/.user_uploaded/media_1793358040216_e819e24f.png';
      if (!fs.existsSync(imgPath)) {
        console.log("Skipping Test 9: user test image not found");
        return;
      }
      const buf = fs.readFileSync(imgPath);
      let pos = 8;
      let width = 0, height = 0;
      const idatChunks: Buffer[] = [];
      while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        if (type === 'IHDR') {
          width = buf.readUInt32BE(pos + 8);
          height = buf.readUInt32BE(pos + 12);
        } else if (type === 'IDAT') {
          idatChunks.push(buf.subarray(pos + 8, pos + 8 + len));
        }
        pos += 12 + len;
      }
      const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
      const rgba = new Uint8ClampedArray(width * height * 4);
      const scanlineLength = 1 + width * 4;
      const prevRow = new Uint8Array(width * 4);
      const currRow = new Uint8Array(width * 4);

      for (let y = 0; y < height; y++) {
        const filter = decompressed[y * scanlineLength];
        const rawRow = decompressed.subarray(y * scanlineLength + 1, (y + 1) * scanlineLength);

        for (let i = 0; i < width * 4; i++) {
          const a = i >= 4 ? currRow[i - 4] : 0;
          const b = prevRow[i];
          const c = i >= 4 ? prevRow[i - 4] : 0;
          let val = rawRow[i];
          if (filter === 1) val = (val + a) & 0xff;
          else if (filter === 2) val = (val + b) & 0xff;
          else if (filter === 3) val = (val + Math.floor((a + b) / 2)) & 0xff;
          else if (filter === 4) {
            const p = a + b - c;
            const pa = Math.abs(p - a);
            const pb = Math.abs(p - b);
            const pc = Math.abs(p - c);
            const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            val = (val + pr) & 0xff;
          }
          currRow[i] = val;
        }
        prevRow.set(currRow);
        rgba.set(currRow, y * width * 4);
      }

      const imgY1 = 110, imgY2 = 880;
      const cropH = imgY2 - imgY1;
      const cropData = new Uint8ClampedArray(width * cropH * 4);
      for (let y = 0; y < cropH; y++) {
        const srcIdx = (imgY1 + y) * width * 4;
        const dstIdx = y * width * 4;
        cropData.set(rgba.subarray(srcIdx, srcIdx + width * 4), dstIdx);
      }

      const res = detectDocumentQuad(cropData, width, cropH);
      assert.ok(res.quad !== null, "Test 9: PAN Card must be detected");
      assert.ok(res.score >= RELIABLE_SCORE, `Test 9: PAN Card score must be >= ${RELIABLE_SCORE}, got ${res.score}`);

      // Check detected coordinates correspond to the card in the center (x: 100-370, y: 300-470)
      const [tl, tr, br, bl] = res.quad;
      assert.ok(tl.x >= 90 && tl.x <= 130 && tl.y >= 290 && tl.y <= 340, `TL position correct: (${tl.x}, ${tl.y})`);
      assert.ok(tr.x >= 330 && tr.x <= 370 && tr.y >= 280 && tr.y <= 330, `TR position correct: (${tr.x}, ${tr.y})`);
      assert.ok(br.x >= 340 && br.x <= 380 && br.y >= 420 && br.y <= 470, `BR position correct: (${br.x}, ${br.y})`);
      assert.ok(bl.x >= 100 && bl.x <= 140 && bl.y >= 440 && bl.y <= 480, `BL position correct: (${bl.x}, ${bl.y})`);

      // Verify perspective correction produces rectangular cropped card
      const bounds: CropBounds = { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
      const corrected = applyPerspectiveCorrection({ data: cropData, width, height: cropH } as any, width, cropH, bounds);
      assert.ok(corrected !== null, "Perspective correction must succeed on PAN card");
      const aspect = corrected.width / corrected.height;
      assert.ok(aspect >= 1.5 && aspect <= 1.9, `Output aspect ratio matches standard ID card (1.5 - 1.9): got ${aspect.toFixed(2)}`);

      console.log(`✓ Scenario 9: User PAN card on floral bedsheet detected with score ${res.score.toFixed(3)}, cropped correctly to ${corrected.width}x${corrected.height} (aspect ${aspect.toFixed(2)})`);
      console.log("=======================================================");
      console.log("ALL 9 VERIFICATION SCENARIOS PASSED WITH ZERO FAILURES!");
      console.log("=======================================================");
    });
  });
}
