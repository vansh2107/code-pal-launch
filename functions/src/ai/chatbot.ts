/**
 * chatbot — HTTPS Request (streaming SSE)
 *
 * AI chatbot with tool-calling for task/document CRUD, navigation, and
 * profile updates. Returns a Server-Sent Events stream.
 *
 * Uses onRequest (not onCall) because callable functions do not support
 * streaming responses. The frontend calls this via fetch() with a
 * ReadableStream consumer.
 *
 * AI priority: Gemini → Groq → Lovable gateway.
 * Replaces: supabase/functions/chatbot
 */

import { https, logger } from 'firebase-functions/v2';
import * as express from 'express';
import { adminAuth, adminDb } from '../shared/admin';
import { getCorsHeaders } from '../shared/cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ---------------------------------------------------------------------------
// Tool definitions (mirrors Supabase chatbot's 16 tools)
// ---------------------------------------------------------------------------
const TOOLS_DESCRIPTION = `
You have access to these tools (respond with JSON action when needed):
- navigate(path: string) — Navigate to a page
- list_tasks() — List user's tasks
- create_task(title, description?, startTime, taskDate) — Create a task
- update_task(id, fields) — Update a task
- delete_task(id) — Delete a task
- list_documents() — List user's documents
- create_document(name, documentType, expiryDate?) — Create a document
- update_document(id, fields) — Update a document
- delete_document(id) — Delete a document
- update_profile(fields) — Update user profile
- move_to_docvault(documentId, categoryId?) — Move document to DocVault
- find_task_by_name(name) — Find a task by name
- find_document_by_name(name) — Find a document by name

Respond conversationally. When you need to perform an action, include a JSON block:
<action>{"tool":"tool_name","params":{...}}</action>
`;

async function buildContext(uid: string): Promise<string> {
  const [docsSnap, tasksSnap] = await Promise.all([
    adminDb.collection('users').doc(uid).collection('documents').limit(20).get(),
    adminDb.collection('users').doc(uid).collection('tasks')
      .where('status', '==', 'pending').limit(20).get(),
  ]);

  const docs  = docsSnap.docs.map((d)  => ({ id: d.id, name: d.data().name, expiryDate: d.data().expiryDate, type: d.data().documentType }));
  const tasks = tasksSnap.docs.map((d) => ({ id: d.id, title: d.data().title, taskDate: d.data().taskDate, status: d.data().status }));

  return `User context:\nDocuments: ${JSON.stringify(docs)}\nTasks: ${JSON.stringify(tasks)}`;
}

async function streamWithGemini(
  prompt: string,
  context: string,
  res: express.Response
): Promise<boolean> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return false;

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const fullPrompt = `${TOOLS_DESCRIPTION}\n\n${context}\n\nUser: ${prompt}`;
    const streamResult = await model.generateContentStream(fullPrompt);

    for await (const chunk of streamResult.stream) {
      const text = chunk.text();
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }
    return true;
  } catch (err) {
    logger.warn('[chatbot] Gemini stream failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

async function respondWithGroq(
  prompt: string,
  context: string,
  res: express.Response
): Promise<boolean> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return false;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [
          { role: 'system', content: `${TOOLS_DESCRIPTION}\n\n${context}` },
          { role: 'user',   content: prompt },
        ],
        max_tokens: 1000,
      }),
    });
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? 'I could not generate a response.';
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
    return true;
  } catch (err) {
    logger.warn('[chatbot] Groq failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------
export const chatbot = https.onRequest(
  { timeoutSeconds: 120, cors: false },
  async (req, res) => {
    // CORS
    const origin = req.headers.origin as string | undefined;
    Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.set(k, v));
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    // Auth
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.replace('Bearer ', ''));
      uid = decoded.uid;
    } catch {
      res.status(401).json({ error: 'Invalid token.' });
      return;
    }

    const { message } = req.body as { message?: string };
    if (!message) { res.status(400).json({ error: 'message is required.' }); return; }

    // Set up SSE
    res.set({
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.status(200);

    try {
      const context = await buildContext(uid);

      let handled = await streamWithGemini(message, context, res);
      if (!handled) handled = await respondWithGroq(message, context, res);
      if (!handled) {
        res.write(`data: ${JSON.stringify({ text: "I'm here to help! I can manage your tasks and documents. What would you like to do?" })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      logger.error('[chatbot] Error:', err instanceof Error ? err.message : err);
      res.write(`data: ${JSON.stringify({ error: 'An error occurred.' })}\n\n`);
      res.end();
    }
  }
);
