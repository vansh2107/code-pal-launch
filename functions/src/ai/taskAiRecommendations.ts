/**
 * taskAiRecommendations — HTTPS Callable
 *
 * Returns a 1-2 sentence productivity tip for a task.
 * AI priority: Gemini → Groq → Lovable gateway → hardcoded fallback.
 *
 * Replaces: supabase/functions/task-ai-recommendations
 */

import { https, logger } from 'firebase-functions/v2';
import { getAiCompletion } from '../shared/aiProviders';

interface RecommendationRequest {
  taskId?: string;
  taskTitle?: string;
  title?: string;
  description?: string;
  taskDescription?: string;
  missedDays?: number;
  status?: string;
}

const FALLBACK_TIPS = [
  'Break this task into smaller steps to make it more manageable. 🚀',
  'Set a specific time block to work on this task without interruptions. 💪',
  'Consider what the single most important next action is for this task. 🎯',
  'Timeboxing this task to 25 minutes can help you stay focused. ⏱️',
  'Write down any blockers for this task so you can address them first. 📝',
];

export const taskAiRecommendations = https.onCall(
  { enforceAppCheck: false, timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const { taskTitle, title, description, taskDescription, missedDays } = request.data as RecommendationRequest;
    const safeTitle = (title || taskTitle || '').trim();
    const safeDesc  = (description || taskDescription || '').trim();

    if (!safeTitle) {
      throw new https.HttpsError('invalid-argument', 'title/taskTitle is required.');
    }

    const systemPrompt = 'You are a productivity expert. Give a specific, actionable tip to help complete this task. Be encouraging but direct. Keep it under 2 sentences.';
    const userPrompt = `Task: "${safeTitle}"
${safeDesc ? `Details: ${safeDesc}` : ''}
${missedDays && missedDays > 0 ? `This task is ${missedDays} day(s) overdue.` : ''}

What's one specific action they should take right now?`;

    const tipText = await getAiCompletion({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const recommendation = tipText || FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];

    logger.info(`[taskAiRecommendations] Generated tip for task "${safeTitle}"`);
    return { success: true, recommendation, tip: recommendation };
  }
);
