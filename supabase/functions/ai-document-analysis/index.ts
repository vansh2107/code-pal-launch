import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sanitize user input to prevent prompt injection
const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[<>"'`\n\r]/g, '') // Remove potentially dangerous characters
    .substring(0, 200) // Enforce max length for general inputs
    .trim();
};

const sanitizeCountry = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[<>"'`\n\r]/g, '')
    .substring(0, 100)
    .trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.text();
    
    // Validate request size
    if (requestBody.length > 5 * 1024 * 1024) {
      console.error('Request too large:', requestBody.length);
      return new Response(
        JSON.stringify({ success: false, error: 'Request too large' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const parsedBody = JSON.parse(requestBody);
    const { documentData, analysisType, userCountry, documents } = parsedBody;
    
    // Validate and sanitize inputs
    if (userCountry && (typeof userCountry !== 'string' || userCountry.length > 100)) {
      console.error('Invalid country input');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid country format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const safeCountry = userCountry ? sanitizeCountry(userCountry) : '';
    
    const validAnalysisTypes = ['classify', 'renewal_prediction', 'cost_estimate', 'priority_scoring', 'full_analysis', 'renewal_suggestions', 'renewal_requirements', 'compliance_check'];
    if (!validAnalysisTypes.includes(analysisType)) {
      console.error('Invalid analysis type:', analysisType);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid analysis type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle batch renewal suggestions
    if (analysisType === 'renewal_suggestions' && documents && Array.isArray(documents)) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }

      console.log(`Generating renewal suggestions for ${documents.length} documents`);
      
      const suggestionPrompt = `You are an AI assistant specializing in document renewal guidance. Analyze the following documents and provide actionable renewal suggestions.

Documents requiring attention:
${documents.map((doc: any) => `
- Document: ${sanitizeInput(doc.name || 'Unnamed')}
- Type: ${sanitizeInput(doc.document_type || 'Unknown')}
- Expiry Date: ${doc.expiry_date}
- Days Until Expiry: ${doc.daysUntilExpiry}
- Issuing Authority: ${sanitizeInput(doc.issuing_authority || 'Not specified')}
`).join('\n')}

For each document, provide:
1. Priority level (high/medium/low) based on urgency
2. A concise suggestion explaining what needs to be done
3. 2-3 specific action items to complete the renewal

Format your response as a JSON array of objects with this structure:
{
  "suggestions": [
    {
      "documentId": "uuid",
      "documentName": "string",
      "priority": "high|medium|low",
      "suggestion": "brief explanation",
      "actionItems": ["item1", "item2", "item3"]
    }
  ]
}`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are a helpful document renewal assistant. Always respond with valid JSON.' },
            { role: 'user', content: suggestionPrompt }
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const errorText = await response.text();
        console.error('AI Gateway error:', response.status, errorText);
        throw new Error('AI analysis request failed');
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;
      
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(aiResponse);
      } catch (e) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse AI response');
        }
      }

      console.log('Renewal suggestions generated successfully');
      return new Response(JSON.stringify(parsedResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting ${analysisType} analysis for document: ${documentData.name}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let systemPrompt = "";
    let userPrompt = "";
    let toolParameters: any = {};

    const countryContext = safeCountry ? `\nUser's Country: ${safeCountry} - Consider country-specific regulations, costs, and procedures.` : '';

    // Sanitize document data
    const safeName = sanitizeInput(documentData.name || 'Unnamed');
    const safeType = sanitizeInput(documentData.document_type || 'Unknown');
    const safeAuthority = sanitizeInput(documentData.issuing_authority || 'Not specified');
    const safeNotes = sanitizeInput(documentData.notes || 'None');

    if (analysisType === "classify") {
      systemPrompt = "You are an expert document classification AI with deep knowledge of international document types, legal requirements, and categorization standards.";
      userPrompt = `Analyze this document and provide detailed classification:
Name: ${safeName}
Current Type: ${safeType}
Issuing Authority: ${safeAuthority}
Notes: ${safeNotes}
Expiry Date: ${documentData.expiry_date}${countryContext}

Consider: document purpose, legal category, regulatory requirements, and international standards.`;
      
      toolParameters = {
        suggestedType: { type: "string", description: "Most appropriate document type" },
        confidence: { type: "number", description: "Confidence level 0-1" },
        reasoning: { type: "string", description: "Detailed explanation for classification" },
        alternativeTypes: { type: "array", items: { type: "string" }, description: "Other possible classifications" }
      };

    } else if (analysisType === "renewal_prediction") {
      systemPrompt = "You are a renewal optimization expert with knowledge of government processing times, international regulations, and best practices for document renewals.";
      userPrompt = `Analyze renewal strategy for this document:
Document: ${safeName}
Type: ${safeType}
Current Expiry: ${documentData.expiry_date}
Days Until Expiry: ${documentData.daysUntilExpiry}
Current Reminder Period: ${documentData.renewal_period_days} days${countryContext}

Consider: processing delays, peak seasons, required documentation, and typical complications.`;
      
      toolParameters = {
        suggestedReminderDays: { type: "number", description: "Optimal days before expiry to start renewal" },
        reasoning: { type: "string", description: "Detailed rationale for the recommendation" },
        urgencyLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
        estimatedProcessingTime: { type: "string", description: "Expected processing duration" },
        renewalTips: { type: "array", items: { type: "string" }, description: "Practical renewal tips" }
      };

    } else if (analysisType === "priority_scoring") {
      systemPrompt = "You are a document priority assessment specialist who evaluates urgency based on multiple factors including expiry timeline, document importance, and potential consequences.";
      userPrompt = `Assess priority for this document:
Name: ${safeName}
Type: ${safeType}
Days Until Expiry: ${documentData.daysUntilExpiry}
Issuing Authority: ${safeAuthority}${countryContext}

Consider: legal consequences of expiry, replacement difficulty, daily usage importance, and grace periods.`;
      
      toolParameters = {
        priorityScore: { type: "number", description: "Priority score 0-100" },
        urgencyLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
        actionRecommendation: { type: "string", description: "Specific action user should take" },
        factors: { type: "array", items: { type: "string" }, description: "Key factors affecting priority" }
      };

    } else if (analysisType === "cost_estimate") {
      systemPrompt = "You are a financial analyst specializing in document renewal costs, government fees, and associated expenses across different countries.";
      userPrompt = `Estimate renewal costs for this document:
Document: ${safeName}
Type: ${safeType}
Issuing Authority: ${safeAuthority}${countryContext}

Provide realistic cost estimates including government fees, service charges, and potential additional costs.`;
      
      toolParameters = {
        estimatedCost: { type: "string", description: "Cost range in local currency" },
        additionalFees: { type: "array", items: { type: "string" }, description: "List of potential additional fees" },
        costSavingTips: { type: "array", items: { type: "string" }, description: "Ways to reduce renewal costs" }
      };

    } else if (analysisType === "compliance_check") {
      systemPrompt = "You are a legal compliance expert with knowledge of document requirements, renewal regulations, and legal obligations across jurisdictions.";
      userPrompt = `Check compliance requirements for this document:
Document: ${safeName}
Type: ${safeType}
Days Until Expiry: ${documentData.daysUntilExpiry}
Issuing Authority: ${safeAuthority}${countryContext}

Identify: legal requirements, necessary documentation, deadlines, and potential compliance issues.`;
      
      toolParameters = {
        isCompliant: { type: "boolean", description: "Current compliance status" },
        complianceDetails: { type: "string", description: "Detailed compliance explanation" },
        requiredDocuments: { type: "array", items: { type: "string" }, description: "Documents needed for renewal" },
        warnings: { type: "array", items: { type: "string" }, description: "Important compliance warnings" }
      };

    } else if (analysisType === "full_analysis") {
      systemPrompt = "You are a comprehensive document management AI providing holistic analysis covering classification, renewal strategy, costs, compliance, and actionable recommendations.";
      userPrompt = `Provide complete analysis for this document:
Document: ${safeName}
Type: ${safeType}
Expiry Date: ${documentData.expiry_date}
Days Until Expiry: ${documentData.daysUntilExpiry}
Issuing Authority: ${safeAuthority}
Notes: ${safeNotes}${countryContext}

Deliver: comprehensive overview, key insights, priority assessment, cost considerations, and step-by-step action plan.`;
      
      toolParameters = {
        summary: { type: "string", description: "Comprehensive overview of the document situation" },
        keyInsights: { 
          type: "array", 
          items: { 
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" }
            }
          },
          description: "Important insights about the document"
        },
        actionPlan: { type: "array", items: { type: "string" }, description: "Step-by-step action plan" },
        urgencyLevel: { type: "string", enum: ["low", "medium", "high", "critical"] }
      };
      
    } else if (analysisType === "renewal_requirements") {
      systemPrompt = "You are a document renewal specialist with expertise in identifying exact documents, items, and requirements needed for renewals across different countries and jurisdictions.";
      userPrompt = `Identify all documents and items required for renewal of this document:
Document: ${safeName}
Type: ${safeType}
Expiry Date: ${documentData.expiry_date}
Days Until Expiry: ${documentData.daysUntilExpiry}
Issuing Authority: ${safeAuthority}${countryContext}

Provide a comprehensive checklist of:
1. Required documents (originals, copies, certified copies)
2. Personal identification needed
3. Photos/images specifications (if any)
4. Fees and payment methods
5. Forms that need to be filled
6. Any medical certificates or tests required
7. Proof of residence or other supporting documents
8. Additional requirements specific to the document type and country

Be specific, practical, and include quantity requirements (e.g., "2 passport-sized photos", "Original birth certificate plus 1 copy").`;
      
      toolParameters = {
        requiredDocuments: { 
          type: "array", 
          items: { 
            type: "object",
            properties: {
              category: { type: "string", description: "Category like 'Identity Proof', 'Photos', 'Fees', etc." },
              items: { type: "array", items: { type: "string" }, description: "List of specific items" }
            }
          },
          description: "Categorized list of required documents and items" 
        },
        processingSteps: { type: "array", items: { type: "string" }, description: "Step-by-step process for renewal" },
        importantNotes: { type: "array", items: { type: "string" }, description: "Critical things to remember" },
        estimatedTimeframe: { type: "string", description: "Expected processing time" },
        whereToApply: { type: "string", description: "Where to submit the renewal application" }
      };
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_document",
            description: "Analyze document and provide structured, actionable insights",
            parameters: {
              type: "object",
              properties: toolParameters,
              required: Object.keys(toolParameters),
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "analyze_document" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error("AI Gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("No analysis result from AI");
    }

    const analysis = JSON.parse(toolCall.function.arguments);
    
    console.log(`Analysis complete for ${analysisType}:`, analysis);

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ai-document-analysis:", error);
    // Sanitized error message for client
    return new Response(
      JSON.stringify({ success: false, error: 'Analysis failed. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
