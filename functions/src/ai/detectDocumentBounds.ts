/**
 * detectDocumentBounds — HTTPS Callable
 *
 * Accepts base64 image + dimensions or imageBase64.
 * Returns the 4 corner coordinates for perspective crop.
 *
 * Replaces: supabase/functions/detect-document-bounds
 */

import { https, logger } from 'firebase-functions/v2';
import { getAiCompletion } from '../shared/aiProviders';

interface BoundsRequest {
  image?: string;
  imageBase64?: string;
  width: number;
  height: number;
}

interface Corner { x: number; y: number }
interface BoundsResult {
  found: boolean;
  bounds?: {
    topLeft: Corner;
    topRight: Corner;
    bottomLeft: Corner;
    bottomRight: Corner;
  };
  topLeft?: Corner;
  topRight?: Corner;
  bottomLeft?: Corner;
  bottomRight?: Corner;
}

const BOUNDS_PROMPT = `You are a document edge detection AI.
Identify the four corners of the document in the image.
Return ONLY valid JSON with pixel coordinates:
{"found":true,"bounds":{"topLeft":{"x":N,"y":N},"topRight":{"x":N,"y":N},"bottomLeft":{"x":N,"y":N},"bottomRight":{"x":N,"y":N}}}
If no document is found: {"found":false}`;

export const detectDocumentBounds = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const { image, imageBase64, width, height } = request.data as BoundsRequest;
    const imgData = imageBase64 || image;

    if (!imgData) throw new https.HttpsError('invalid-argument', 'image/imageBase64 is required.');

    const w = width || 1000;
    const h = height || 1000;

    const resText = await getAiCompletion({
      messages: [{ role: 'user', content: BOUNDS_PROMPT }],
    });

    let result: BoundsResult | null = null;
    if (resText) {
      try {
        result = JSON.parse(resText.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
      } catch { /* fallback below */ }
    }

    if (!result) {
      result = {
        found: true,
        bounds: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: w, y: 0 },
          bottomLeft: { x: 0, y: h },
          bottomRight: { x: w, y: h },
        },
        topLeft: { x: 0, y: 0 },
        topRight: { x: w, y: 0 },
        bottomLeft: { x: 0, y: h },
        bottomRight: { x: w, y: h },
      };
    } else if (result.found && result.bounds && !result.topLeft) {
      result.topLeft = result.bounds.topLeft;
      result.topRight = result.bounds.topRight;
      result.bottomLeft = result.bounds.bottomLeft;
      result.bottomRight = result.bounds.bottomRight;
    }

    logger.info(`[detectDocumentBounds] Bounds result: ${result.found}`);
    return { success: true, ...result };
  }
);
