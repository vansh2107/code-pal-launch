/**
 * documentRenewalAdvisor — HTTPS Callable
 *
 * Fetches user's documents for context, then provides AI renewal advice.
 * Response starts with "Recommended renewal start: N days before expiry".
 *
 * Replaces: supabase/functions/document-renewal-advisor
 */

import { aiSecrets } from '../shared/secrets';
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
  { enforceAppCheck: false, timeoutSeconds: 60, secrets: aiSecrets },
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

    const isOtherOrUnknown = !documentType || ['other', 'unknown', 'general'].includes(documentType.toLowerCase().trim());
    const normalizedDocType = isOtherOrUnknown ? 'Other (General Document)' : documentType;

    const systemPrompt = isOtherOrUnknown
      ? `You are a document renewal advisor assistant for general and miscellaneous documents.
CRITICAL: You MUST start your response on the first line with EXACTLY this format:
"Recommended renewal start: [NUMBER] days before expiry"

STRICT RULES:
- The document type is "Other" / general document.
- You MUST provide generic, flexible renewal advice.
- You MUST PROHIBIT passport-specific guidance, immigration forms, or passport photos unless the document name explicitly specifies a passport.
- Do NOT assume citizenship or passport requirements.

Then provide:
1. Required documents for renewal (generic list: original document/contract, valid government ID, proof of address or billing details if applicable)
2. Key steps and timeline considerations (contact issuing party/provider, check renewal portal or terms)
3. Important deadlines`
      : `You are a document renewal advisor assistant.
CRITICAL: You MUST start your response on the first line with EXACTLY this format:
"Recommended renewal start: [NUMBER] days before expiry"

Then provide:
1. Required documents for renewal
2. Key steps and timeline considerations
3. Important deadlines`;

    const userPrompt = `${context}\nDocument Type: ${normalizedDocType}\nQuestion/Prompt: ${question || 'How to renew this document?'}`;

    let adviceText = await getAiCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Validate that AI did not hallucinate passport advice for an "other" document
    if (isOtherOrUnknown && adviceText && /passport[- ]size photo|consulate|embassy|citizenship proof/i.test(adviceText)) {
      logger.warn('[documentRenewalAdvisor] AI returned passport guidance for Other document; replacing with generic fallback.');
      adviceText = null;
    }

    const safeDocType = isOtherOrUnknown ? 'document' : (documentType || 'document');
    const safeDocName = documentName ? ` (${documentName})` : '';

    const fallbackAdvice = isOtherOrUnknown
      ? `Recommended renewal start: 30 days before expiry

Here are general renewal guidelines for your ${safeDocType}${safeDocName}:

1. Required Documents for Renewal:
- Current original document, contract, or reference number
- Valid government-issued photo ID (if verification is required)
- Recent payment receipt, billing statement, or renewal notice (if applicable)

2. Key Steps & Timeline Considerations:
- Review the issuer's or service provider's specific renewal policy online.
- Check if renewal or replacement can be submitted online or via customer portal.
- Standard processing time generally ranges between 5 to 15 business days.

3. Important Deadlines:
- Submit renewal request at least 30 days before expiration to prevent lapse in service.`
      : `Recommended renewal start: 30 days before expiry

Here are the details and requirements to renew your ${safeDocType}${safeDocName}:

1. Required Documents for Renewal:
- Current original document or card
- Completed renewal application form
- Proof of identification
- Recent photograph (if required by issuing authority)
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
