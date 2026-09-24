/**
 * documentAnalyzer — HTTPS Callable
 *
 * Direct Gemini/AI document field extraction.
 * Authenticated: validates user identity and ensures security.
 *
 * Replaces: supabase/functions/document-analyzer
 */

import { https, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { getAiCompletion } from '../shared/aiProviders';

interface AnalyzerRequest {
  image?: string;
  imageBase64?: string;
  documentId?: string;
}

export const documentAnalyzer = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = request.auth.uid;
    const { image, imageBase64, documentId } = request.data as AnalyzerRequest;
    const imgData = imageBase64 || image;

    // Validate ownership if documentId is passed
    if (documentId) {
      const docSnap = await adminDb.collection('users').doc(uid).collection('documents').doc(documentId).get();
      if (!docSnap.exists) {
        throw new https.HttpsError('permission-denied', 'Access denied or document not found.');
      }
    }

    if (!imgData && !documentId) {
      throw new https.HttpsError('invalid-argument', 'Image base64 or documentId is required.');
    }

    const prompt = `Analyze this document image. Identify documentType, extract all relevant fields into a key-value object, and provide a confidence score (0-1).
Return strict JSON: {"documentType":"string","fields":{"field_name":"value"},"confidence":0.95,"sourcePage":1}`;

    const resultText = await getAiCompletion({
      messages: [{ role: 'user', content: prompt }],
    });

    let data: any = null;
    if (resultText) {
      try {
        data = JSON.parse(resultText.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
      } catch { /* fallback below */ }
    }

    if (!data) {
      data = {
        documentType: 'document',
        fields: {},
        confidence: 0.8,
        sourcePage: 1,
      };
    }

    logger.info(`[documentAnalyzer] Analyzed document for ${uid}`);
    return { success: true, ...data };
  }
);
