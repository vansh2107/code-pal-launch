import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sanitize user input to prevent prompt injection
const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[<>"'`\n\r]/g, '') // Remove potentially dangerous characters
    .substring(0, 100) // Enforce max length
    .trim();
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.text();
    
    // Validate request size (max 40MB for multi-page base64 payloads)
    if (requestBody.length > 40 * 1024 * 1024) {
      console.error('Request too large:', requestBody.length);
      return new Response(
        JSON.stringify({ success: false, error: 'Image too large. Maximum size is 10MB.' }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageBase64, pages, country } = JSON.parse(requestBody);

    // Build the ordered list of page images: multi-page PDF payload or single image
    const pageImages: { pageNumber: number; content: string }[] = Array.isArray(pages) && pages.length > 0
      ? [...pages]
          .filter((p: any) => typeof p?.content === "string")
          .sort((a: any, b: any) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0))
          .map((p: any, i: number) => ({ pageNumber: p.pageNumber ?? i + 1, content: p.content }))
      : imageBase64
        ? [{ pageNumber: 1, content: imageBase64 }]
        : [];

    if (pageImages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No document content provided.' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Validate and sanitize country input
    if (country && (typeof country !== 'string' || country.length > 100)) {
      console.error('Invalid country input');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid country format' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const safeCountry = country ? sanitizeInput(country) : '';
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    type Provider = { name: string; key: string; endpoint: string; model: string; jsonMode: boolean };
    const providers: Provider[] = [];

    if (LOVABLE_API_KEY) {
      providers.push({
        name: "lovable",
        key: LOVABLE_API_KEY,
        endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
        model: "google/gemini-2.5-flash",
        jsonMode: true,
      });
    }
    if (GEMINI_API_KEY) {
      providers.push({
        name: "gemini",
        key: GEMINI_API_KEY,
        endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        model: "gemini-2.0-flash",
        jsonMode: true,
      });
    }
    if (GROQ_API_KEY) {
      // Groq vision model that actually exists and does NOT emit reasoning traces
      providers.push({
        name: "groq",
        key: GROQ_API_KEY,
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        jsonMode: true,
      });
    }

    if (providers.length === 0) {
      console.error("SCAN AI DEBUG | no AI provider key configured (LOVABLE_API_KEY, GEMINI_API_KEY, GROQ_API_KEY)");
      return new Response(
        JSON.stringify({
          success: false,
          code: "AI_UNAVAILABLE",
          error: "AI service is not configured. Please enter the document details manually.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messages: any[] = [
          {
            role: "system",
            content: `You are a document data extraction and renewal analysis assistant. Extract document information, identify missing/uncertain details, resolve cross-page discrepancies, and suggest renewal reminder periods based on document type and regulations.

Extract and analyze the following fields:
- name: the document name/title (be specific, e.g. "Indian Union Driving Licence")
- document_type: Choose the MOST SPECIFIC type from the list below
- issuing_authority: the organization that issued the document
- expiry_date: expiration date in YYYY-MM-DD format (or null/empty if none)
- renewal_period_days: suggestion for reminder days before expiry (default: 30)

Document Type Options (choose the MOST SPECIFIC match):
- passport_renewal, drivers_license, vehicle_registration, health_card
- work_permit_visa, student_visa, permanent_residency
- business_license, professional_license, software_license
- training_certificate, course_registration
- tax_filing, ticket_fines, voting_registration
- credit_card, insurance_policy, family_insurance
- utility_bills, loan_payment, subscription, joint_subscription
- bank_card, health_checkup, medication_refill
- pet_vaccination, pet_care, fitness_membership
- library_book, warranty, device_warranty, home_maintenance
- children_documents, school_enrollment, property_lease
- domain_name, web_hosting, cloud_storage, password_security
- other (only if none of the above match)

CRITICAL RULES FOR NO HALLUCINATION:
1. NEVER invent/guess dates, names, or identifiers. If a field is not visible, set its status to "missing" and its value to null.
2. If a field is present but too blurry, obscured, or partially readable, set its status to "uncertain" and value to null/what is readable.
3. If the document type genuinely does not have an expiry date (e.g., Aadhaar, PAN card, permanent certificates), set expiry_date status to "not_applicable" and value to null.
4. Process EVERY page. If a field has different values on different pages (e.g. conflicting dates/names), set its status to "conflicting" and state the conflict in the reason.

For renewal_period_days, consider:
- Passports/immigration: 90-180 days
- Professional licenses: 60-90 days
- Driver's Licenses: 30-60 days
- Insurance: 30-45 days
- Memberships: 30 days
- Simple permits: 14-30 days

${safeCountry ? `User is in: ${safeCountry}. Consider this country's specific renewal timelines.` : 'Country unknown - use general best practices.'}

Respond ONLY with valid JSON structure:
{
  "document_type": "drivers_license",
  "name": "Indian Driving Licence",
  "issuing_authority": "RTO Delhi",
  "expiry_date": "2032-12-31",
  "renewal_period_days": 60,
  "notes": "Any additional descriptive context about extraction, conflicts or missing details.",
  "fieldStatuses": {
    "name": {
      "value": "Indian Driving Licence",
      "status": "extracted",
      "confidence": 0.95,
      "sourcePage": 1,
      "evidence": "FORM 6 DRIVING LICENCE DELHI",
      "reason": "Successfully extracted from licence header on page 1."
    },
    "expiry_date": {
      "value": "2032-12-31",
      "status": "extracted",
      "confidence": 0.95,
      "sourcePage": 1,
      "evidence": "Valid Upto: 31-12-2032",
      "reason": "Successfully parsed expiry date."
    },
    "issuing_authority": {
      "value": "RTO Delhi",
      "status": "extracted",
      "confidence": 0.90,
      "sourcePage": 1,
      "evidence": "Licensing Authority Delhi",
      "reason": "Extracted from signature section."
    }
  }
}

The status values must be: "extracted" | "missing" | "uncertain" | "not_applicable" | "conflicting".`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `This document has ${pageImages.length} page(s), provided below in page order. Consider ALL pages together as ONE single document - information may be spread across different pages (e.g. name on one page, dates on another). Combine everything into one final result. Determine an intelligent renewal reminder period based on the document type${safeCountry ? ` and ${safeCountry}'s regulations` : ''}.`,
              },
              ...pageImages.flatMap((p) => ([
                { type: "text", text: `--- Page ${p.pageNumber} of ${pageImages.length} ---` },
                { type: "image_url", image_url: { url: p.content } },
              ])),
            ],
          },
    ];

    // ---- Robust content -> JSON extraction (handles reasoning models emitting <think>) ----
    const stripReasoning = (text: string): string =>
      text
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<think>[\s\S]*$/i, "")
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    const extractJsonObject = (text: string): any | null => {
      const cleaned = stripReasoning(text);
      // Find the largest balanced { ... } block
      for (let start = cleaned.indexOf("{"); start !== -1; start = cleaned.indexOf("{", start + 1)) {
        let depth = 0;
        for (let i = start; i < cleaned.length; i++) {
          const ch = cleaned[i];
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              try {
                return JSON.parse(cleaned.slice(start, i + 1));
              } catch (_) {
                break; // try next opening brace
              }
            }
          }
        }
      }
      return null;
    };

    const debug: Record<string, unknown> = {
      function: "scan-document",
      pages: pageImages.length,
      imageMimeType: (pageImages[0].content.match(/^data:([^;]+);/) || [])[1] || "unknown",
      imageSizeBytes: Math.round((pageImages[0].content.length * 3) / 4),
      requestPayloadType: Array.isArray(pages) && pages.length > 0 ? "pages[]" : "imageBase64",
    };

    let extractedData: any = null;
    let lastFailure: { provider: string; status?: number; body?: string; reason: string } | null = null;

    for (const provider of providers) {
      console.log(`SCAN AI DEBUG | trying provider=${provider.name} model=${provider.model}`, debug);
      let response: Response;
      try {
        response = await fetch(provider.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            max_tokens: 2048,
            temperature: 0,
            ...(provider.jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
        });
      } catch (netErr) {
        lastFailure = { provider: provider.name, reason: `network error: ${String(netErr)}` };
        console.error("SCAN AI DEBUG | network failure", lastFailure);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        lastFailure = { provider: provider.name, status: response.status, body: body.slice(0, 800), reason: "non-2xx from AI provider" };
        console.error("SCAN AI DEBUG | provider error", lastFailure);
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ success: false, code: "RATE_LIMIT", error: "AI is rate limited right now. Please try again in a moment or enter details manually." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ success: false, code: "PAYMENT_REQUIRED", error: "AI credits are depleted. Please top up credits, or enter the details manually." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        continue; // try the next provider
      }

      const data = await response.json();
      const content: string | undefined = data.choices?.[0]?.message?.content;
      const finishReason = data.choices?.[0]?.finish_reason;
      console.log(`SCAN AI DEBUG | provider=${provider.name} finish_reason=${finishReason} content_length=${content?.length ?? 0}`);

      if (!content) {
        lastFailure = { provider: provider.name, status: response.status, body: JSON.stringify(data).slice(0, 800), reason: "empty content" };
        console.error("SCAN AI DEBUG | empty content", lastFailure);
        continue;
      }

      const parsed = extractJsonObject(content);
      if (!parsed) {
        lastFailure = { provider: provider.name, status: 200, body: content.slice(0, 800), reason: `no parsable JSON (finish_reason=${finishReason})` };
        console.error("SCAN AI DEBUG | unparsable AI content", lastFailure);
        continue;
      }

      extractedData = parsed;
      console.log("SCAN AI DEBUG | extracted data", extractedData);
      break;
    }

    if (!extractedData) {
      // AI pipeline failure — NOT the same as "the document could not be read"
      return new Response(
        JSON.stringify({
          success: false,
          code: "AI_ERROR",
          error: "The AI service could not analyse this document right now. Please enter the details manually.",
          debug: { ...debug, lastFailure },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- No-expiry document normalisation (Aadhaar, PAN, birth certificate, ...) ----
    const NO_EXPIRY_HINTS = [
      "aadhaar", "aadhar", "uidai", "pan card", "pan_card", "permanent account number",
      "birth certificate", "marksheet", "degree", "diploma", "transcript", "voter id",
      "voter_id", "incorporation", "social security", "national id",
    ];
    const haystack = [extractedData.name, extractedData.document_type, extractedData.issuing_authority, extractedData.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const looksNoExpiry = NO_EXPIRY_HINTS.some((h) => haystack.includes(h));

    if (looksNoExpiry || !extractedData.expiry_date) {
      extractedData.expiry_date = extractedData.expiry_date || null;
      if (looksNoExpiry) {
        extractedData.expiry_date = null;
        extractedData.has_expiry = false;
        extractedData.fieldStatuses = {
          ...(extractedData.fieldStatuses || {}),
          expiry_date: {
            value: null,
            status: "not_applicable",
            confidence: 1,
            reason: "This document type does not have an expiry date.",
          },
        };
      }
    }

    // Map AI-returned document types to valid database enums
    const documentTypeMap: { [key: string]: string } = {
      // License types
      'drivers_license': 'license',
      'driving_license': 'license',
      'professional_license': 'license',
      'software_license': 'license',
      'business_license': 'license',
      
      // Passport types
      'passport': 'passport',
      'passport_renewal': 'passport',
      
      // Permit types
      'permit': 'permit',
      'work_permit': 'permit',
      'work_permit_visa': 'permit',
      'permanent_residency': 'permit',
      'vehicle_registration': 'permit',
      
      // Insurance types
      'insurance': 'insurance',
      'insurance_policy': 'insurance',
      'health_card': 'insurance',
      'family_insurance': 'insurance',
      
      // Certification types
      'certification': 'certification',
      'training_certificate': 'certification',
      'course_registration': 'certification',
      'student_visa': 'certification',
      
      // Other catch-all
      'other': 'other',
      'credit_card': 'other',
      'utility_bills': 'other',
      'loan_payment': 'other',
      'subscription': 'other',
      'bank_card': 'other',
      'health_checkup': 'other',
      'medication_refill': 'other',
      'pet_vaccination': 'other',
      'fitness_membership': 'other',
      'library_book': 'other',
      'warranty': 'other',
      'home_maintenance': 'other',
      'tax_filing': 'other',
      'ticket_fines': 'tickets_and_fines',
      'voting_registration': 'other',
      'children_documents': 'other',
      'school_enrollment': 'other',
      'joint_subscription': 'other',
      'pet_care': 'other',
      'property_lease': 'other',
      'domain_name': 'other',
      'web_hosting': 'other',
      'cloud_storage': 'other',
      'device_warranty': 'other',
      'password_security': 'other',
    };

    // Map the document type to valid enum for reference, but return detailed type to client
    const main_type = documentTypeMap[extractedData.document_type] || 'other';
    console.log(`Mapped document type: ${extractedData.document_type} -> ${main_type}`);

    const responsePayload = {
      ...extractedData,
      // Keep detailed type in document_type
      document_type: extractedData.document_type,
      main_type,
    };

    return new Response(
      JSON.stringify({ success: true, data: responsePayload }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in scan-document function:", error);
    // Sanitized error message for client
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to process document. Please try again.' 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
