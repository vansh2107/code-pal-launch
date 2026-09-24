/**
 * documentAnalyzer — HTTPS Callable (no auth — internal use)
 *
 * Direct Gemini document field extraction.
 * Note: auth is intentionally not enforced here to match the original
 * edge function's behaviour. Consider adding auth in production.
 *
 * Replaces: supabase/functions/document-analyzer
 */

import { https, logger } from 'firebase-functions/v2';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface AnalyzerRequest {
  image: string;   // base64
}

export const documentAnalyzer = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 30 },
  async (request) => {
    const { image } = request.data as AnalyzerRequest;
    if (!image) throw new https.HttpsError('invalid-argument', 'image is required.');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new https.HttpsError('failed-precondition', 'GEMINI_API_KEY not set.');

    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const mime   = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent([
        'Extract all text fields from this document image. Respond with JSON.',
        { inlineData: { data: base64, mimeType: mime } },
      ]);
      const text = result.response.text().trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      return { success: true, data: JSON.parse(text) };
    } catch (err) {
      logger.error('[documentAnalyzer] Error:', err instanceof Error ? err.message : err);
      throw new https.HttpsError('internal', 'Document analysis failed.');
    }
  }
);
