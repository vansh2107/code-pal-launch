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
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  documentId:   string;
  analysisType: AnalysisType;
}

function buildPrompt(type: AnalysisType, doc: Record<string, unknown>): string {
  const base = `Document: ${JSON.stringify(doc)}`;
  const prompts: Record<AnalysisType, string> = {
    classify:             `${base}\nClassify this document and provide category, subcategory, and importance level. Respond in JSON.`,
    renewal_prediction:   `${base}\nPredict when renewal should start, estimated processing time, and urgency. Respond in JSON.`,
    cost_estimate:        `${base}\nEstimate renewal cost range and fees. Respond in JSON.`,
    priority_scoring:     `${base}\nScore this document's renewal priority 1-10 with reasons. Respond in JSON.`,
    full_analysis:        `${base}\nProvide a complete analysis including classification, renewal timeline, costs, and recommendations. Respond in JSON.`,
    renewal_suggestions:  `${base}\nProvide 3-5 actionable renewal suggestions. Respond in JSON.`,
    renewal_requirements: `${base}\nList the typical documents and steps required for renewal. Respond in JSON.`,
    compliance_check:     `${base}\nCheck for compliance issues and flag any concerns. Respond in JSON.`,
  };
  return prompts[type];
}

async function callGemini(prompt: string): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function callGroq(prompt: string): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
      }),
    });
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    return JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
  } catch {
    return null;
  }
}

const MOCK_RESULTS: Record<AnalysisType, Record<string, unknown>> = {
  classify:             { category: 'Identity', subcategory: 'Government ID', importance: 'high' },
  renewal_prediction:   { startRenewal: '90 days before expiry', processingTime: '2-4 weeks', urgency: 'medium' },
  cost_estimate:        { estimatedCost: '$50-$150', currency: 'USD', notes: 'Varies by jurisdiction' },
  priority_scoring:     { score: 7, reasons: ['Expiring within 90 days', 'Required for travel'] },
  full_analysis:        { summary: 'Document requires attention', renewalUrgency: 'medium' },
  renewal_suggestions:  { suggestions: ['Start renewal 90 days early', 'Check for fee changes', 'Gather supporting documents'] },
  renewal_requirements: { documents: ['Proof of identity', 'Payment'], steps: ['Fill form', 'Submit', 'Wait for processing'] },
  compliance_check:     { compliant: true, issues: [] },
};

export const aiDocumentAnalysis = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const { documentId, analysisType } = request.data as AnalysisRequest;
    if (!documentId || !analysisType) {
      throw new https.HttpsError('invalid-argument', 'documentId and analysisType are required.');
    }

    const uid = request.auth.uid;
    const docSnap = await adminDb
      .collection('users').doc(uid)
      .collection('documents').doc(documentId).get();

    if (!docSnap.exists) {
      throw new https.HttpsError('not-found', 'Document not found.');
    }

    const docData = docSnap.data()!;
    const prompt  = buildPrompt(analysisType, docData);

    let result: Record<string, unknown> | null = null;
    result = await callGemini(prompt);
    if (!result) result = await callGroq(prompt);
    if (!result) result = MOCK_RESULTS[analysisType];

    logger.info(`[aiDocumentAnalysis] ${analysisType} for doc ${documentId}`);
    return { success: true, result };
  }
);
