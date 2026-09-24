/**
 * taskAiRecommendations — HTTPS Callable
 *
 * Returns a 1-2 sentence productivity tip for a task.
 * AI priority: Gemini → Groq → Lovable gateway → hardcoded fallback.
 *
 * Replaces: supabase/functions/task-ai-recommendations
 */

import { https, logger } from 'firebase-functions/v2';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface RecommendationRequest {
  taskId:          string;
  taskTitle:       string;
  taskDescription?: string;
}

const FALLBACK_TIPS = [
  'Break this task into smaller steps to make it more manageable.',
  'Set a specific time block to work on this task without interruptions.',
  'Consider what the single most important next action is for this task.',
  'Timeboxing this task to 25 minutes can help you stay focused.',
  'Write down any blockers for this task so you can address them first.',
];

async function callGemini(prompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch { return null; }
}

async function callGroq(prompt: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
      }),
    });
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch { return null; }
}

export const taskAiRecommendations = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const { taskTitle, taskDescription } = request.data as RecommendationRequest;
    if (!taskTitle) {
      throw new https.HttpsError('invalid-argument', 'taskTitle is required.');
    }

    const prompt = `Give a 1-2 sentence productivity tip for completing this task.
Task: "${taskTitle}"${taskDescription ? `\nDescription: "${taskDescription}"` : ''}
Keep it practical, specific, and encouraging. No preamble.`;

    let tip: string | null = null;
    tip = await callGemini(prompt);
    if (!tip) tip = await callGroq(prompt);
    if (!tip) tip = FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];

    logger.info(`[taskAiRecommendations] Generated tip for task "${taskTitle}"`);
    return { success: true, tip };
  }
);
