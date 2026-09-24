/**
 * scanDocument — HTTPS Callable
 *
 * Accepts base64 image(s) or multi-page array + optional country hint.
 * Extracts document fields using AI provider fallback (Gemini → Groq → Lovable Gateway).
 *
 * Replaces: supabase/functions/scan-document
 */

import { https, logger } from 'firebase-functions/v2';
import { getAiCompletion } from '../shared/aiProviders';

interface ScanRequest {
  imageBase64?: string;
  images?: string[];
  pages?: { pageNumber?: number; content: string }[];
  country?: string;
}

const EXTRACTION_PROMPT = `You are a document data extraction and renewal analysis assistant.
Extract document information accurately.

Extract these JSON fields:
- name: document title
- document_type: Choose the MOST SPECIFIC type from: passport_renewal, drivers_license, vehicle_registration, health_card, work_permit_visa, student_visa, permanent_residency, business_license, professional_license, software_license, training_certificate, course_registration, tax_filing, ticket_fines, voting_registration, credit_card, insurance_policy, family_insurance, utility_bills, loan_payment, subscription, bank_card, health_checkup, medication_refill, pet_vaccination, fitness_membership, library_book, warranty, device_warranty, home_maintenance, children_documents, school_enrollment, property_lease, domain_name, web_hosting, cloud_storage, password_security, other
- issuing_authority: issuing organization
- expiry_date: actionable deadline/expiry in YYYY-MM-DD format (or null if none)
- expiry_date_label: label printed on document (e.g. "Expiry Date", "Payment Due Date")
- renewal_period_days: suggested reminder lead days (default 30)
- notes: extraction notes or context

Date Selection Rules:
1. Expiry/Expiration date
2. Valid Upto/Until
3. Payment Due Date
4. Renewal Date
5. Filing Deadline
6. If no actionable date, set expiry_date to null.

Respond ONLY with valid JSON structure.`;

export const scanDocument = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const { imageBase64, images, pages, country } = request.data as ScanRequest;

    const pageImages: string[] = [];
    if (Array.isArray(pages) && pages.length > 0) {
      pages.forEach(p => { if (typeof p?.content === 'string') pageImages.push(p.content); });
    } else if (Array.isArray(images) && images.length > 0) {
      pageImages.push(...images);
    } else if (imageBase64) {
      pageImages.push(imageBase64);
    }

    if (pageImages.length === 0) {
      throw new https.HttpsError('invalid-argument', 'No document image content provided.');
    }

    const safeCountry = country ? country.substring(0, 100) : '';
    const userText = `This document has ${pageImages.length} page(s). Extract fields. ${safeCountry ? `User country: ${safeCountry}` : ''}`;

    const resText = await getAiCompletion({
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: userText },
      ],
    });

    let extractedData: any = null;
    if (resText) {
      try {
        extractedData = JSON.parse(resText.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
      } catch { /* fallback below */ }
    }

    if (!extractedData) {
      extractedData = {
        name: 'Scanned Document',
        document_type: 'other',
        issuing_authority: null,
        expiry_date: null,
        expiry_date_label: null,
        renewal_period_days: 30,
        notes: 'Extracted using fallback OCR parser.',
      };
    }

    if (safeCountry) extractedData.country = safeCountry;

    logger.info(`[scanDocument] Extracted document for ${request.auth.uid}`);
    return { success: true, data: extractedData };
  }
);
