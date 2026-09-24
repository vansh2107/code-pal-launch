/**
 * documentRenewalAdvisor — HTTPS Callable
 *
 * Fetches user's documents for context, then provides AI renewal advice.
 * Response starts with "Recommended renewal start: N days before expiry".
 *
 * Replaces: supabase/functions/document-renewal-advisor
 */

import { https, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { getAiCompletion } from '../shared/aiProviders';

interface AdvisorRequest {
  documentId?: string;
  documentType?: string;
  documentName?: string;
  expiryDate?: string;
  question?: string;
}

export const documentRenewalAdvisor = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = request.auth.uid;
    const { documentId, documentType, documentName, expiryDate, question } = request.data as AdvisorRequest;

    let context = '';
    if (documentId) {
      const docSnap = await adminDb.collection('users').doc(uid).collection('documents').doc(documentId).get();
      if (docSnap.exists) context = `Document Context: ${JSON.stringify(docSnap.data())}`;
    } else if (documentType || documentName) {
      context = `Document: ${documentName || ''} (${documentType || ''}), Expiry: ${expiryDate || 'N/A'}`;
    } else {
      const docsSnap = await adminDb.collection('users').doc(uid).collection('documents').limit(10).get();
      const docs = docsSnap.docs.map(d => ({ name: d.data().name, type: d.data().documentType, expiry: d.data().expiryDate }));
      context = `User Documents: ${JSON.stringify(docs)}`;
    }

    const systemPrompt = `You are a document renewal advisor assistant.
CRITICAL: You MUST start your response on the first line with EXACTLY this format:
"Recommended renewal start: [NUMBER] days before expiry"

Then provide:
1. Required documents for renewal
2. Key steps and timeline considerations
3. Important deadlines`;

    const userPrompt = `${context}\nQuestion/Prompt: ${question || 'How to renew this document?'}`;

    const adviceText = await getAiCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const safeDocType = documentType || 'document';
    const safeDocName = documentName ? ` (${documentName})` : '';

    const fallbackAdvice = `Recommended renewal start: 30 days before expiry

Here are the details and requirements to renew your ${safeDocType}${safeDocName}:

1. Required Documents for Renewal:
- Current original document or card
- Completed renewal application form
- Proof of identification/citizenship
- 2 recent passport-size photographs
- Renewal fee payment

2. Key Steps & Timeline Considerations:
- Check for online portal submission options.
- Gather all required documents and ID copies beforehand.
- Standard processing time is typically 10 to 15 business days.

3. Important Deadlines:
- Submit renewal application at least 30 days before expiration.`;

    const advice = adviceText || fallbackAdvice;

    logger.info(`[documentRenewalAdvisor] Answered for user ${uid}`);
    return { success: true, advice };
  }
);
