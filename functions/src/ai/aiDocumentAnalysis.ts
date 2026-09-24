/**
 * aiDocumentAnalysis — HTTPS Callable
 *
 * Provides 8 AI analysis types for a document.
 * AI priority: Gemini → Groq → Lovable gateway → mock fallback.
 *
 * Replaces: supabase/functions/ai-document-analysis
 */

import { https, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { getAiCompletion } from '../shared/aiProviders';

type AnalysisType =
  | 'classify'
  | 'renewal_prediction'
  | 'cost_estimate'
  | 'priority_scoring'
  | 'full_analysis'
  | 'renewal_suggestions'
  | 'renewal_requirements'
  | 'compliance_check';

interface AnalysisRequest {
  documentData?: Record<string, any>;
  documentId?: string;
  analysisType: AnalysisType;
  userCountry?: string;
  documents?: any[];
}

export const aiDocumentAnalysis = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = request.auth.uid;
    const { documentData, documentId, analysisType, userCountry, documents } = request.data as AnalysisRequest;

    if (!analysisType) {
      throw new https.HttpsError('invalid-argument', 'analysisType is required.');
    }

    // Batch renewal suggestions for multiple documents
    if (analysisType === 'renewal_suggestions' && Array.isArray(documents)) {
      const prompt = `You are an AI document renewal assistant. Analyze these documents and provide actionable renewal suggestions:
${documents.map(d => `- ${d.name || 'Unnamed'} (${d.document_type || 'Unknown'}): expires ${d.expiry_date || 'N/A'}, ${d.daysUntilExpiry} days left`).join('\n')}

Format as JSON: {"suggestions":[{"documentId":"string","documentName":"string","priority":"high|medium|low","suggestion":"string","actionItems":["item1","item2"]}]}`;

      const resText = await getAiCompletion({ messages: [{ role: 'user', content: prompt }] });
      if (resText) {
        try {
          const parsed = JSON.parse(resText.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
          return parsed;
        } catch { /* fallback below */ }
      }

      // High quality fallback
      const fallbackSuggestions = documents.map((doc: any) => ({
        documentId: doc.id || 'mock-id',
        documentName: doc.name || 'Unnamed',
        priority: doc.daysUntilExpiry < 30 ? 'high' : doc.daysUntilExpiry < 90 ? 'medium' : 'low',
        suggestion: `Ensure you check the requirements for renewing your ${doc.name || 'document'}.`,
        actionItems: [
          `Verify processing times for ${doc.document_type || 'document'}`,
          'Prepare required identity proofs',
          'Book an appointment if required',
        ],
      }));
      return { suggestions: fallbackSuggestions };
    }

    // Single document analysis: load from DB if documentId provided
    let docObj = documentData;
    if (!docObj && documentId) {
      const snap = await adminDb.collection('users').doc(uid).collection('documents').doc(documentId).get();
      if (!snap.exists) throw new https.HttpsError('not-found', 'Document not found.');
      docObj = snap.data();
    }

    if (!docObj) {
      throw new https.HttpsError('invalid-argument', 'documentData or valid documentId is required.');
    }

    const safeName = docObj.name || 'Unnamed';
    const safeType = docObj.document_type || docObj.documentType || 'Unknown';
    const safeAuth = docObj.issuing_authority || docObj.issuingAuthority || 'Not specified';
    const daysUntilExpiry = docObj.daysUntilExpiry ?? 30;

    const countryPrompt = userCountry ? `User Country: ${userCountry}.` : '';

    const prompt = `Analyze this document:
Name: ${safeName}
Type: ${safeType}
Issuing Authority: ${safeAuth}
Expiry Date: ${docObj.expiry_date || docObj.expiryDate || 'N/A'}
Days Until Expiry: ${daysUntilExpiry}
${countryPrompt}
Analysis Type Requested: ${analysisType}

Respond with valid structured JSON appropriate for ${analysisType}.`;

    const resultText = await getAiCompletion({ messages: [{ role: 'user', content: prompt }] });
    let analysis: any = null;
    if (resultText) {
      try {
        analysis = JSON.parse(resultText.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
      } catch { /* fallback below */ }
    }

    if (!analysis) {
      // Mock fallback
      if (analysisType === 'classify') {
        analysis = { suggestedType: safeType, confidence: 0.95, reasoning: 'Classification based on metadata.', alternativeTypes: ['other'] };
      } else if (analysisType === 'renewal_prediction') {
        analysis = { suggestedReminderDays: 30, reasoning: 'Recommended lead time.', urgencyLevel: daysUntilExpiry < 30 ? 'high' : 'medium', estimatedProcessingTime: '10-15 business days', renewalTips: ['Prepare ID documents', 'Check fee structure'] };
      } else if (analysisType === 'priority_scoring') {
        analysis = { priorityScore: daysUntilExpiry < 30 ? 90 : 50, urgencyLevel: daysUntilExpiry < 30 ? 'high' : 'medium', actionRecommendation: 'Start renewal preparation.', factors: [`${daysUntilExpiry} days left`] };
      } else if (analysisType === 'cost_estimate') {
        analysis = { estimatedCost: '$50 - $150', additionalFees: ['Processing fee'], costSavingTips: ['Apply early'] };
      } else if (analysisType === 'compliance_check') {
        analysis = { isCompliant: daysUntilExpiry > 0, complianceDetails: daysUntilExpiry > 0 ? 'Document is valid.' : 'Document is expired.', requiredDocuments: ['Original ID'], warnings: ['Expired documents may incur penalties.'] };
      } else if (analysisType === 'renewal_requirements') {
        analysis = { requiredDocuments: [{ category: 'Identification', items: ['Current original card', 'Secondary ID'] }], processingSteps: ['Fill application', 'Submit to registry'], importantNotes: ['Ensure clear photos'], estimatedTimeframe: '2-3 weeks', whereToApply: 'Official portal' };
      } else {
        analysis = { summary: `Complete analysis for ${safeName}.`, keyInsights: [{ title: 'Status', description: `${daysUntilExpiry} days until expiry` }], actionPlan: ['Gather documents', 'Submit application'], urgencyLevel: daysUntilExpiry < 30 ? 'high' : 'medium' };
      }
    }

    logger.info(`[aiDocumentAnalysis] Finished ${analysisType} for user ${uid}`);
    return { success: true, analysis };
  }
);
