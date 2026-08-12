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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    let apiKey = "";
    let apiEndpoint = "";
    let modelName = "";

    // Prioritize GROQ_API_KEY if it is configured
    if (GROQ_API_KEY) {
      console.log("Using Groq API for document scanning");
      apiKey = GROQ_API_KEY;
      apiEndpoint = "https://api.groq.com/openai/v1/chat/completions";
      modelName = "llama-3.2-90b-vision-preview"; // Vision model for reading images
    } else if (LOVABLE_API_KEY) {
      console.log("Using Lovable API for document scanning");
      apiKey = LOVABLE_API_KEY;
      apiEndpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
      modelName = "google/gemini-2.5-flash";
    }

    if (!apiKey) {
      console.error("No AI API key configured (GROQ_API_KEY or LOVABLE_API_KEY)");
      throw new Error("AI service is not configured. Please set GROQ_API_KEY in your Supabase Edge Function secrets.");
    }

    console.log(`Analyzing complete document with AI (${pageImages.length} page(s)) using ${modelName}...`);

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "system",
            content: `You are a document data extraction and renewal analysis assistant. Extract document information and intelligently determine renewal reminder periods based on document type and country-specific regulations.

Extract the following information:
- document_type: Choose the MOST SPECIFIC type from the detailed list below
- name: the document name/title (be specific, e.g., "Indian Union Driving Licence")
- issuing_authority: the organization that issued the document (be specific with full name)
- expiry_date: expiration date in YYYY-MM-DD format
- renewal_period_days: INTELLIGENT suggestion for reminder days before expiry

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

For renewal_period_days, consider:
1. Document type urgency and processing time
2. Country-specific renewal regulations and processing times
3. Common practices in that country
4. Complexity of renewal process

Examples:
- Passports/immigration: 90-180 days (international travel documents need early renewal)
- Professional licenses: 60-90 days (may require exams/courses)
- Driver's Licenses: 30-60 days (varies by country)
- Insurance: 30-45 days (need time for quotes comparison)
- Memberships: 30 days
- Simple permits: 14-30 days

${safeCountry ? `User is in: ${safeCountry}. Consider this country's specific renewal timelines and regulations.` : 'Country unknown - use general best practices.'}

Respond ONLY with valid JSON:
{
  "document_type": "drivers_license",
  "name": "Indian Union Driving Licence",
  "issuing_authority": "Regional Transport Office, Bangalore",
  "expiry_date": "2046-07-20",
  "renewal_period_days": 60
}

CRITICAL VALIDATION RULES:
1. document_type MUST be one of the specific types listed above (e.g., "drivers_license" not "license")
2. Choose the MOST SPECIFIC type that matches the document
3. Be as specific as possible in the name and issuing_authority fields`,
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
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error("Rate limit exceeded");
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        console.error("Payment required");
        return new Response(
          JSON.stringify({ error: "AI credits depleted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    console.log("AI response received:", data);

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in AI response");
    }

    // Check if AI refused to extract (not a valid document)
    if (content.toLowerCase().includes("cannot extract") || 
        content.toLowerCase().includes("unable to extract") ||
        content.toLowerCase().includes("not a document")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "The image does not appear to be a valid document. Please upload a clear photo of an official document like a passport, license, permit, or certificate."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in AI response. Content:", content);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Could not extract document information. Please ensure the image is clear and contains a valid document."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let extractedData;
    try {
      extractedData = JSON.parse(jsonMatch[0]);
      console.log("Extracted data:", extractedData);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Could not parse document information. Please try again with a clearer image."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
