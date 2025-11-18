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
    const { taskTitle, taskDescription, missedDays, status } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let systemPrompt = "You are a witty productivity coach. Analyze the task and give highly specific, actionable advice in 1-2 sentences. Avoid generic suggestions like 'break it down' unless truly relevant. Focus on task-specific strategies, time management, or motivation based on what the task actually requires.";
    let userPrompt = "";

    if (missedDays >= 3) {
      userPrompt = `Task: "${taskTitle}"${taskDescription ? ` (Details: ${taskDescription})` : ""}. This has been pending ${missedDays} days. Give specific, encouraging advice to complete THIS exact task - consider what type of task it is and suggest concrete next steps with humor.`;
    } else if (missedDays > 0) {
      userPrompt = `Task: "${taskTitle}"${taskDescription ? ` (Details: ${taskDescription})` : ""}. Carried forward ${missedDays} time(s). Suggest specific ways to tackle THIS particular task today - focus on what the task actually needs.`;
    } else {
      userPrompt = `Task: "${taskTitle}"${taskDescription ? ` (Details: ${taskDescription})` : ""}. Analyze this specific task and provide a targeted productivity tip that matches what this task requires - be specific, not generic.`;
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
          { role: "user", content: userPrompt },
        ],
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ recommendation: "💡 Take a short break, then tackle this task with fresh energy!" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const recommendation = data.choices?.[0]?.message?.content || "Stay focused and complete this task!";

    return new Response(
      JSON.stringify({ recommendation }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        recommendation: "💪 You've got this! Break it down into smaller steps and start now.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
