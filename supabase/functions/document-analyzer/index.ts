import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.0";

const gemini = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY")!);

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { image } = await req.json();
  const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `
    Analyze this document image. 
    1. Identify the document type.
    2. Extract all relevant fields (name, dates, numbers, addresses, identifiers, etc.).
    3. Return ONLY a strict JSON object with this structure: 
       { 
         "documentType": string, 
         "fields": { "field_name": "value" }, 
         "confidence": number, 
         "sourcePage": number 
       }
    4. If any field is missing or unreadable, set value to null. 
    5. Do not invent information.
  `;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: image.split(",")[1], mimeType: "image/jpeg" } }
  ]);

  const responseText = result.response.text();
  return new Response(responseText, { headers: { "Content-Type": "application/json" } });
});
