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
    
    // Validate request size (max 15MB for base64 encoded image ~10MB actual)
    if (requestBody.length > 15 * 1024 * 1024) {
      console.error('Request too large:', requestBody.length);
      return new Response(
        JSON.stringify({ success: false, error: 'Image too large. Maximum size is 10MB.' }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageBase64, country } = JSON.parse(requestBody);
    
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
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Processing document image with AI...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a document data extraction and renewal analysis assistant. Extract document information and intelligently determine renewal reminder periods based on document type and country-specific regulations.

Extract the following information:
- document_type: one of (government_documents, legal_documents, immigration_documents, license_certification, insurance_policies, billing_payments, medical_documents, education, tickets_fines, memberships_subscriptions, other)
- name: the document name/title
- issuing_authority: the organization that issued the document
- expiry_date: expiration date in YYYY-MM-DD format
- renewal_period_days: INTELLIGENT suggestion for reminder days before expiry

Document Categories:
- government_documents: Official government IDs, licenses, registrations (e.g., driver's license, national ID, vehicle registration)
- legal_documents: Contracts, deeds, legal agreements, powers of attorney
- immigration_documents: Visas, work permits, passports, residence permits
- license_certification: Professional licenses, certifications, qualifications (e.g., medical license, CPA)
- insurance_policies: All types of insurance (health, auto, home, life)
- billing_payments: Bills, invoices, receipts, payment documents
- medical_documents: Health records, prescriptions, medical appointments
- education: Degrees, transcripts, certificates, diplomas
- tickets_fines: Traffic tickets, parking fines, penalties
- memberships_subscriptions: Club memberships, gym subscriptions, service subscriptions
- other: Anything that doesn't clearly fit the above

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
  "document_type": "government_documents",
  "name": "Driver's License",
  "issuing_authority": "Department of Motor Vehicles",
  "expiry_date": "2025-12-31",
  "renewal_period_days": 45
}`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract the document information from this image and determine an intelligent renewal reminder period based on the document type${safeCountry ? ` and ${safeCountry}'s regulations` : ''}.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64,
                },
              },
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

    // Parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const extractedData = JSON.parse(jsonMatch[0]);
    console.log("Extracted data:", extractedData);

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
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
