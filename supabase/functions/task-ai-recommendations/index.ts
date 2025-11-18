import { handleCorsOptions, createJsonResponse, createErrorResponse } from '../_shared/cors.ts';
import { sanitizeInput } from '../_shared/notifications.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions();
  }

  try {
    const { taskTitle, taskDescription, missedDays, status } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }
    
    const safeTitle = sanitizeInput(taskTitle);
    const safeDesc = sanitizeInput(taskDescription);

    if (!safeTitle) {
      return createErrorResponse('Task title is required', 400);
    }

    const systemPrompt = 'You are a witty productivity coach. Analyze the task and give highly specific, actionable advice in 1-2 sentences. Avoid generic suggestions unless truly relevant. Focus on task-specific strategies, time management, or motivation based on what the task actually requires.';
    
    let userPrompt = '';
    const missedDaysNum = parseInt(String(missedDays)) || 0;

    if (missedDaysNum >= 3) {
      userPrompt = `Task: "${safeTitle}"${safeDesc ? ` (Details: ${safeDesc})` : ''}. This has been pending ${missedDaysNum} days. Give specific, encouraging advice to complete THIS exact task - consider what type of task it is and suggest concrete next steps with humor.`;
    } else if (missedDaysNum > 0) {
      userPrompt = `Task: "${safeTitle}"${safeDesc ? ` (Details: ${safeDesc})` : ''}. Carried forward ${missedDaysNum} time(s). Suggest specific ways to tackle THIS particular task today - focus on what the task actually needs.`;
    } else {
      userPrompt = `Task: "${safeTitle}"${safeDesc ? ` (Details: ${safeDesc})` : ''}. Analyze this specific task and provide a targeted productivity tip that matches what this task requires - be specific, not generic.`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 100,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        return createJsonResponse({ 
          recommendation: '💡 Take a short break, then tackle this task with fresh energy!' 
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const recommendation = data.choices?.[0]?.message?.content || 'Stay focused and complete this task!';

    return createJsonResponse({ recommendation });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('AI request timeout');
      return createJsonResponse({ 
        recommendation: '⚡ Quick tip: Start with the smallest step possible!' 
      });
    }
    console.error('Error in task-ai-recommendations:', error);
    return createJsonResponse({
      recommendation: '💪 You\'ve got this! Break it down into smaller steps and start now.',
    });
  }
});
