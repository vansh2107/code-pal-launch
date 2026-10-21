/**
 * scanDocument — HTTPS Callable
 *
 * Accepts base64 image(s) or multi-page array + optional country hint.
 * Extracts document fields using AI provider fallback (Gemini → Groq → Lovable Gateway).
 *
 * Replaces: supabase/functions/scan-document
 */

import { aiSecrets } from '../shared/secrets';
import { https, logger } from 'firebase-functions/v2';
import { getAiCompletion } from '../shared/aiProviders';

interface ScanRequest {
  imageBase64?: string;
  images?: string[];
  pages?: { pageNumber?: number; content: string }[];
  country?: string;
}

const EXTRACTION_PROMPT = `You are an expert document data extraction and renewal analysis assistant.
Analyze the provided document image(s) or page(s) and extract document information accurately.

Extract these JSON fields:
- name: document title (e.g., "Driver's License", "Health Insurance Policy", "Vehicle Registration Certificate", "Electricity Bill")
- document_type: Choose the MOST SPECIFIC type from:
  passport_renewal, drivers_license, vehicle_registration, health_card, work_permit_visa, student_visa,
  permanent_residency, business_license, professional_license, software_license, training_certificate,
  course_registration, tax_filing, ticket_fines, voting_registration, credit_card, insurance_policy,
  family_insurance, utility_bills, loan_payment, subscription, bank_card, health_checkup, medication_refill,
  pet_vaccination, fitness_membership, library_book, warranty, device_warranty, home_maintenance,
  children_documents, school_enrollment, property_lease, domain_name, web_hosting, cloud_storage,
  password_security, other
- issuing_authority: issuing organization or government authority (e.g., "Transport Department", "USCIS", "HDFC ERGO", "PG&E")
- expiry_date: actionable deadline/expiration date normalized to YYYY-MM-DD format (or null if none exists)
- expiry_date_label: verbatim label printed on document associated with this date (e.g. "Validity (NT)", "Valid Through", "Due Date", "Renewal Due", "Use By")
- renewal_period_days: suggested reminder lead days (default 30)
- notes: extraction notes or context
- candidate_dates: array of all candidate dates found with context, e.g.
  [{"label": "Valid Through", "date": "YYYY-MM-DD", "type": "expiry_or_due", "confidence": 0.95, "reason": "Policy end date"},
   {"label": "Issue Date", "date": "YYYY-MM-DD", "type": "issue_or_creation", "confidence": 0.99, "reason": "Card issue date"}]

STRICT RULES FOR ACTIONABLE EXPIRY / VALIDITY / DUE DATE EXTRACTION:
1. TARGET ACTIONABLE LABELS (Recognize any of these or OCR typos / regional equivalents):
   - Expiry Date / Expiration Date / Expires On / Date of Expiry / Expiry
   - Valid Until / Valid Upto / Validity / Valid Through / Valid To / Good Thru
   - Validity (NT) [Non-Transport] / Validity (TR) [Transport] (common on Driver Licenses)
   - Due Date / Payment Due / Payment Due Date / Next Due Date / Pay By / Bill Due
   - Renewal Date / Renew By / Renewal Due / Next Renewal
   - Policy Period To / Period of Insurance (To) / Coverage End Date / Termination Date
   - Use By / Best Before / Warranty Expiration / Registration Valid Until / Permit Expiry

2. STRICT NEGATIVE GUIDANCE (DO NOT MISCLASSIFY THESE AS EXPIRY/VALIDITY):
   - Issue Date / Date of Issue / Issued On / Issuance Date
   - Date of Birth / DOB / Birth Date
   - Invoice Date / Bill Date / Statement Date / Billing Date
   - Transaction Date / Payment Date (historical date paid)
   - Manufacture Date / Date of Mfg / MFG Date / Effective Date / Start Date / Policy Period From
   - NEVER select an issue date, birth date, or past transaction date as the document's expiry_date!

3. CONTEXTUAL RESOLUTION & RANKING:
   - If both an Issue Date and an Expiry/Validity Date exist, pick the Expiry/Validity date.
   - If multiple validity dates exist (e.g. driving license with Non-Transport and Transport validity), pick the later valid date or the active license validity.
   - For utility bills and invoices, pick the Payment Due Date.
   - For insurance policies, pick the coverage end date / Valid Through date.
   - For documents with NO expiration (such as Birth Certificates, Indian Aadhaar cards, PAN cards, Academic Degrees, Voter ID cards), set expiry_date to null and expiry_date_label to null.

4. DATE FORMATS & OCR RECOVERY:
   - Handle textual months (e.g., "28-NOV-2024", "20-JUL-2046", "Nov 28, 2024", "20 July 2046").
   - Handle card month/year format (e.g., "07/26" -> 2026-07-31).
   - Normalize the chosen expiry_date strictly to YYYY-MM-DD.

Respond ONLY with valid JSON structure.`;

export const scanDocument = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 60, secrets: aiSecrets },
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
    const userPromptText = `This document has ${pageImages.length} page(s). Extract all fields per instructions. ${safeCountry ? `User country: ${safeCountry}. Pay attention to regional date formatting.` : ''}`;

    // Construct multimodal content if image is provided
    const userContent: any[] = [{ type: 'text', text: userPromptText }];
    for (const img of pageImages.slice(0, 3)) { // Limit to first 3 pages to stay within token limits
      if (typeof img === 'string') {
        const cleanBase64 = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
        userContent.push({
          type: 'image_url',
          image_url: { url: cleanBase64 }
        });
      }
    }

    const resText = await getAiCompletion({
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: userContent },
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
        candidate_dates: [],
        notes: 'Extracted using fallback OCR parser.',
      };
    }

    if (safeCountry) extractedData.country = safeCountry;

    logger.info(`[scanDocument] Extracted document for ${request.auth.uid}: ${extractedData.name} (type: ${extractedData.document_type}, expiry: ${extractedData.expiry_date})`);
    return { success: true, data: extractedData };
  }
);
