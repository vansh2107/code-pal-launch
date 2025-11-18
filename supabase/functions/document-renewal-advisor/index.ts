import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sanitize user input to prevent prompt injection
const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[<>"'`\n\r]/g, '') // Remove potentially dangerous characters
    .substring(0, 200) // Enforce max length
    .trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentType, documentName, expiryDate, question } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get user's documents for context
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error("Unauthorized");
    }

    // Fetch user's documents
    const { data: userDocuments } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id);

    // Sanitize document data for context
    const sanitizedDocs = userDocuments?.map(doc => ({
      name: sanitizeInput(doc.name || 'Unnamed'),
      type: sanitizeInput(doc.document_type || 'Unknown'),
      expiry: doc.expiry_date
    })) || [];

    const systemPrompt = `You are a helpful document renewal advisor assistant. 
Your role is to provide clear, concise information about document renewal requirements.

Context about user's documents:
${sanitizedDocs.map(doc => `- ${doc.name} (${doc.type}): expires on ${doc.expiry}`).join('\n') || 'No documents yet'}

When advising about document renewals:
1. List the required documents needed for renewal
2. Mention typical processing times
3. Provide any important deadlines or considerations
4. Suggest documents the user might already have that can be used
5. Be specific to the document type mentioned
6. When asked about renewal timeline, recommend how many days before expiry to start the process

Keep responses clear, organized, and actionable.`;

    // Sanitize user inputs
    const safeQuestion = question ? sanitizeInput(question) : '';
    const safeDocType = documentType ? sanitizeInput(documentType) : '';
    const safeDocName = documentName ? sanitizeInput(documentName) : '';

    let userPrompt = safeQuestion;
    
    if (!safeQuestion && safeDocType) {
      userPrompt = `For a ${safeDocType}${safeDocName ? ` (${safeDocName})` : ''}${expiryDate ? ` expiring on ${new Date(expiryDate).toLocaleDateString()}` : ''}:

CRITICAL: You MUST start your response with EXACTLY this format on the first line:
"Recommended renewal start: [NUMBER] days before expiry"

Replace [NUMBER] with the specific number of days. This is mandatory.

Then provide:
1. What documents are required for renewal
2. Key steps and timeline considerations
3. Any important deadlines

Example first line: "Recommended renewal start: 30 days before expiry"`;
    }

    console.log('Calling Lovable AI Gateway with prompt:', userPrompt);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { 
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { 
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const advice = data.choices[0].message.content;

    console.log('AI response received successfully');

    return new Response(
      JSON.stringify({ advice }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in document-renewal-advisor:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
