const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, description, missedDays, status } = await req.json();
    
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ recommendation: 'Break this task into smaller steps and start with the easiest one! 🚀' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sanitizedTitle = (title || '').trim().slice(0, 200);
    const sanitizedDescription = (description || '').trim().slice(0, 500);

    const systemPrompt = 'You are a productivity expert. Give a specific, actionable tip to help complete this task. Be encouraging but direct. Keep it under 2 sentences.';

    const userPrompt = `Task: "${sanitizedTitle}"
    ${sanitizedDescription ? `Details: ${sanitizedDescription}` : ''}
    ${missedDays > 0 ? `This task is ${missedDays} day(s) overdue.` : ''}
    
    What's one specific action they should take right now?`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ recommendation: 'Start with the first step. What can you do in 5 minutes? 💪' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      const recommendation = data.choices?.[0]?.message?.content?.trim() || 
        'Focus on the first step. Small progress builds momentum! 🚀';

      return new Response(
        JSON.stringify({ recommendation }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ recommendation: 'Break it down and start with the easiest part! 🎯' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in task-ai-recommendations:', error);
    return new Response(
      JSON.stringify({ recommendation: 'You got this! Start with one small step. 💪' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
