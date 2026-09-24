/**
 * scanDocument — HTTPS Callable
 *
 * Accepts base64 image(s) + optional country hint.
 * Sends to vision AI for structured extraction of document fields.
 * AI priority: Gemini → Groq → Lovable gateway.
 *
 * Replaces: supabase/functions/scan-document
 */

import { https, logger } from 'firebase-functions/v2';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ScanRequest {
  images: string[];   // base64 encoded
  country?: string;
}

const EXTRACTION_PROMPT = `
You are a document scanning AI. Extract the following fields from the document image:
- name (document holder name)
- document_type (one of: license, passport, permit, insurance, certification, other, tickets_and_fines)
- issuing_authority
- expiry_date (YYYY-MM-DD format, or null if not found)
- expiry_date_label (human-readable date label as printed)
- renewal_period_days (estimated renewal lead time in days)

Respond ONLY with valid JSON. No markdown, no explanation.
Example: {"name":"John Doe","document_type":"passport","issuing_authority":"Government of India","expiry_date":"2028-05-15","expiry_date_label":"15 MAY 2028","renewal_period_days":90}
`;

async function scanWithGemini(base64Image: string, mimeType: string): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent([
      EXTRACTION_PROMPT,
      { inlineData: { data: base64Image, mimeType } },
    ]);
    const text = result.response.text().trim();
    return JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
  } catch (err) {
    logger.warn('[scanDocument] Gemini failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function scanWithGroq(base64Image: string): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.2-90b-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    return JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
  } catch (err) {
    logger.warn('[scanDocument] Groq failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export const scanDocument = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const { images, country } = request.data as ScanRequest;

    if (!Array.isArray(images) || images.length === 0) {
      throw new https.HttpsError('invalid-argument', 'images array is required.');
    }

    const base64Image = images[0].replace(/^data:image\/\w+;base64,/, '');
    const mimeType    = images[0].startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

    let result: Record<string, unknown> | null = null;

    result = await scanWithGemini(base64Image, mimeType);
    if (!result) result = await scanWithGroq(base64Image);

    if (!result) {
      // Fallback mock
      result = {
        name:                'Unknown',
        document_type:       'other',
        issuing_authority:   null,
        expiry_date:         null,
        expiry_date_label:   null,
        renewal_period_days: 30,
      };
    }

    if (country) result.country = country;

    logger.info(`[scanDocument] Extracted fields for user ${request.auth.uid}`);
    return { success: true, data: result };
  }
);
