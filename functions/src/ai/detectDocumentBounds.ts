/**
 * detectDocumentBounds — HTTPS Callable
 *
 * Accepts base64 image + dimensions.
 * Returns the 4 corner coordinates for perspective crop.
 *
 * Replaces: supabase/functions/detect-document-bounds
 */

import { https, logger } from 'firebase-functions/v2';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface BoundsRequest {
  image:  string;  // base64
  width:  number;
  height: number;
}

interface Corner { x: number; y: number }
interface BoundsResult {
  found:        boolean;
  topLeft?:     Corner;
  topRight?:    Corner;
  bottomLeft?:  Corner;
  bottomRight?: Corner;
}

const BOUNDS_PROMPT = `
You are a document edge detection AI.
Identify the four corners of the document in the image.
Return ONLY valid JSON with pixel coordinates:
{"found":true,"topLeft":{"x":N,"y":N},"topRight":{"x":N,"y":N},"bottomLeft":{"x":N,"y":N},"bottomRight":{"x":N,"y":N}}
If no document is found: {"found":false}
`;

export const detectDocumentBounds = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const { image, width, height } = request.data as BoundsRequest;
    if (!image) throw new https.HttpsError('invalid-argument', 'image is required.');

    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const mime   = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fallback: return full-image corners
      return { found: true, topLeft: {x:0,y:0}, topRight: {x:width,y:0}, bottomLeft: {x:0,y:height}, bottomRight: {x:width,y:height} };
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent([
        BOUNDS_PROMPT,
        { inlineData: { data: base64, mimeType: mime } },
      ]);
      const text = result.response.text().trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(text) as BoundsResult;
      logger.info('[detectDocumentBounds] Bounds detected:', parsed.found);
      return parsed;
    } catch (err) {
      logger.warn('[detectDocumentBounds] Gemini failed:', err instanceof Error ? err.message : err);
      // Fallback
      return { found: true, topLeft: {x:0,y:0}, topRight: {x:width,y:0}, bottomLeft: {x:0,y:height}, bottomRight: {x:width,y:height} };
    }
  }
);
