import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, width, height } = await req.json();

    if (!imageBase64 || !width || !height) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing imageBase64, width, or height" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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
          {
            role: "system",
            content: `You are a document boundary detector. Given a photo, identify the exact corners of the document (paper, card, certificate, license, passport, etc.) in the image.

The image has dimensions ${width}x${height} pixels.

Return the 4 corner coordinates of the document as pixel values. The corners must form a quadrilateral that tightly wraps ONLY the document, excluding any background (table, bedsheet, floor, desk, etc.).

Rules:
- Detect the DOCUMENT edges, not the entire image
- If the document is tilted/rotated, return the actual corner positions (not axis-aligned)
- Coordinates must be in pixels relative to the image dimensions (${width}x${height})
- topLeft = top-left corner of the document as it appears
- topRight = top-right corner
- bottomLeft = bottom-left corner  
- bottomRight = bottom-right corner
- Be as precise as possible — the crop quality depends on your accuracy
- If you cannot find a document, return {"found": false}

Respond ONLY with valid JSON, no markdown:
{"found": true, "topLeft": {"x": 100, "y": 50}, "topRight": {"x": 900, "y": 60}, "bottomLeft": {"x": 90, "y": 700}, "bottomRight": {"x": 910, "y": 710}}`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Detect the document boundaries in this image. Return the 4 corner coordinates as JSON.",
              },
              {
                type: "image_url",
                image_url: { url: imageBase64 },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits depleted" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("AI gateway error:", response.status);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ success: false, error: "Could not parse AI response" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bounds = JSON.parse(jsonMatch[0]);

    if (!bounds.found) {
      return new Response(
        JSON.stringify({ success: true, found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate coordinates are within image bounds
    const corners = [bounds.topLeft, bounds.topRight, bounds.bottomLeft, bounds.bottomRight];
    for (const c of corners) {
      if (!c || typeof c.x !== "number" || typeof c.y !== "number") {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid corner coordinates" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      c.x = Math.max(0, Math.min(width, c.x));
      c.y = Math.max(0, Math.min(height, c.y));
    }

    return new Response(
      JSON.stringify({
        success: true,
        found: true,
        bounds: {
          topLeft: bounds.topLeft,
          topRight: bounds.topRight,
          bottomLeft: bounds.bottomLeft,
          bottomRight: bounds.bottomRight,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in detect-document-bounds:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to detect document boundaries" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
