/**
 * documentRenewalAdvisor — HTTPS Callable
 *
 * Fetches user's documents for context, then provides AI renewal advice.
 * Response must start with "Recommended renewal start: N days before expiry".
 *
 * Replaces: supabase/functions/document-renewal-advisor
 */

import { https, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface AdvisorRequest {
  documentId?: string;
  question:    string;
}

async function callGemini(prompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const res = await model.generateContent(prompt);
    return res.response.text().trim();
  } catch { return null; }
}

async function callGroq(prompt: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
      }),
    });
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch { return null; }
}

export const documentRenewalAdvisor = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = request.auth.uid;
    const { documentId, question } = request.data as AdvisorRequest;

    if (!question) throw new https.HttpsError('invalid-argument', 'question is required.');

    // Build context from user's documents
    let context = '';
    if (documentId) {
      const docSnap = await adminDb.collection('users').doc(uid).collection('documents').doc(documentId).get();
      if (docSnap.exists) context = `Document context: ${JSON.stringify(docSnap.data())}`;
    } else {
      const docsSnap = await adminDb.collection('users').doc(uid).collection('documents').limit(10).get();
      const docs = docsSnap.docs.map((d) => ({ name: d.data().name, expiryDate: d.data().expiryDate, type: d.data().documentType }));
      context = `User documents: ${JSON.stringify(docs)}`;
    }

    const systemInstruction = `You are a document renewal expert. Your responses MUST start with "Recommended renewal start: N days before expiry".`;
    const prompt = `${systemInstruction}\n\n${context}\n\nQuestion: ${question}`;

    let advice: string | null = null;
    advice = await callGemini(prompt);
    if (!advice) advice = await callGroq(prompt);
    if (!advice) advice = 'Recommended renewal start: 90 days before expiry. Please consult the issuing authority for specific requirements.';

    logger.info(`[documentRenewalAdvisor] Answered for user ${uid}`);
    return { success: true, advice };
  }
);
