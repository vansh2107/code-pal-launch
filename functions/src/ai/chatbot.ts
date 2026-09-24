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

export const chatbot = https.onRequest(
  { timeoutSeconds: 120, cors: false },
  async (req: express.Request, res: express.Response) => {
    // CORS
    const origin = req.headers.origin as string | undefined;
    Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.set(k, v));
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    // Auth verification
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

    const { messages } = req.body as { messages?: any[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array is required.' });
      return;
    }

    // Set up SSE headers
    res.set({
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.status(200);

    // Fetch user context from Firestore
    let userContext = '';
    try {
      const [docsSnap, tasksSnap] = await Promise.all([
        adminDb.collection('users').doc(uid).collection('documents').orderBy('expiryDate', 'asc').limit(20).get(),
        adminDb.collection('users').doc(uid).collection('tasks').orderBy('taskDate', 'asc').limit(20).get(),
      ]);

      if (!docsSnap.empty) {
        userContext += `\n\nUser's documents (use these names for operations):\n${docsSnap.docs.map(doc => {
          const d = doc.data();
          return `- "${d.name}" (${d.documentType}): expires ${d.expiryDate}, ID: ${doc.id}`;
        }).join('\n')}`;
      }

      if (!tasksSnap.empty) {
        userContext += `\n\nUser's tasks (use these titles for operations):\n${tasksSnap.docs.map(task => {
          const t = task.data();
          return `- "${t.title}": ${t.taskDate}, status: ${t.status}, ID: ${task.id}`;
        }).join('\n')}`;
      }
    } catch (e) {
      logger.warn('[chatbot] Error fetching context:', e);
    }

    const systemPrompt = `You are the AI Agent inside a Capacitor + React + Firebase mobile app named **Remonk Reminder**.  
Your job is to understand natural language and convert it into correct frontend actions, backend API calls, navigation, file uploads, filters, updates, and reminder scheduling.

===============================
STRICT RULES
===============================
1. **Use ONLY existing files, components, services, APIs, hooks, and layouts inside the project**.  
2. **Never create new files or rename anything.**  
3. **All actions MUST match the real code of this project exactly** (pages, hooks, API names, param names).  
4. **NAME-BASED OPERATIONS ARE REQUIRED**: When user mentions a task or document BY NAME:
   - Use the *_by_name tools (delete_task_by_name, update_task_by_name, delete_document_by_name, update_document_by_name)
   - These tools will find the record by name and handle disambiguation if multiple matches exist
   - NEVER ask user for ID - always resolve by name
5. After every create/update action on tasks, notifications will be automatically scheduled.

===============================
NATURAL LANGUAGE UNDERSTANDING
===============================
Recognize command variations for CREATE, UPDATE, DELETE.

===============================
CURRENT USER CONTEXT
===============================
${userContext}
`;

    const tools = [
      {
        type: "function",
        function: {
          name: "navigate",
          description: "Navigate to a page in the app.",
          parameters: {
            type: "object",
            properties: {
              page: { type: "string", enum: ["/", "/documents", "/docvault", "/tasks", "/scan", "/profile", "/notifications"] },
              filter: { type: "string", enum: ["all", "valid", "expiring", "expired", "license", "passport", "permit", "insurance", "certification", "tickets_and_fines", "other"] }
            },
            required: ["page"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_documents",
          description: "Fetch user's documents",
          parameters: { type: "object", properties: { limit: { type: "number" } } }
        }
      },
      {
        type: "function",
        function: {
          name: "find_document_by_name",
          description: "Search for a document by name using fuzzy matching",
          parameters: { type: "object", properties: { search_name: { type: "string" } }, required: ["search_name"] }
        }
      },
      {
        type: "function",
        function: {
          name: "find_task_by_name",
          description: "Search for a task by title using fuzzy matching",
          parameters: { type: "object", properties: { search_name: { type: "string" } }, required: ["search_name"] }
        }
      },
      {
        type: "function",
        function: {
          name: "create_document",
          description: "Create a new document entry.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              document_type: { type: "string", enum: ["license", "passport", "permit", "insurance", "certification", "tickets_and_fines", "other"] },
              expiry_date: { type: "string" },
              issuing_authority: { type: "string" },
              category_detail: { type: "string" },
              notes: { type: "string" }
            },
            required: ["name", "document_type", "expiry_date"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_document_by_name",
          description: "Update a document by searching for it by name.",
          parameters: {
            type: "object",
            properties: {
              search_name: { type: "string" },
              name: { type: "string" },
              expiry_date: { type: "string" },
              issuing_authority: { type: "string" },
              notes: { type: "string" }
            },
            required: ["search_name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_document_by_name",
          description: "Delete a document by searching for it by name.",
          parameters: { type: "object", properties: { search_name: { type: "string" } }, required: ["search_name"] }
        }
      },
      {
        type: "function",
        function: {
          name: "get_tasks",
          description: "Fetch user's tasks",
          parameters: { type: "object", properties: { status: { type: "string" }, date: { type: "string" } } }
        }
      },
      {
        type: "function",
        function: {
          name: "create_task",
          description: "Create a new task.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              task_date: { type: "string" },
              start_time: { type: "string" },
              end_time: { type: "string" }
            },
            required: ["title", "task_date", "start_time"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_task_by_name",
          description: "Update a task by searching for it by title/name.",
          parameters: {
            type: "object",
            properties: {
              search_name: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              task_date: { type: "string" },
              start_time: { type: "string" },
              end_time: { type: "string" },
              status: { type: "string" }
            },
            required: ["search_name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_task_by_name",
          description: "Delete a task by searching for it by title/name.",
          parameters: { type: "object", properties: { search_name: { type: "string" } }, required: ["search_name"] }
        }
      },
      {
        type: "function",
        function: {
          name: "update_profile",
          description: "Update user profile settings",
          parameters: {
            type: "object",
            properties: {
              display_name: { type: "string" },
              country: { type: "string" },
              timezone: { type: "string" },
              push_notifications_enabled: { type: "boolean" },
              email_notifications_enabled: { type: "boolean" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "move_to_docvault",
          description: "Move a document to DocVault",
          parameters: { type: "object", properties: { document_id: { type: "string" } }, required: ["document_id"] }
        }
      },
      {
        type: "function",
        function: {
          name: "trigger_upload",
          description: "Trigger file upload UI",
          parameters: { type: "object", properties: { type: { type: "string" } }, required: ["type"] }
        }
      }
    ];

    const geminiKey  = process.env.GEMINI_API_KEY;
    const groqKey    = process.env.GROQ_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;

    let apiKey = '';
    let apiEndpoint = '';
    let modelName = '';

    if (geminiKey) {
      apiKey = geminiKey;
      apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      modelName = 'gemini-2.5-flash';
    } else if (groqKey) {
      apiKey = groqKey;
      apiEndpoint = 'https://api.groq.com/openai/v1/chat/completions';
      modelName = 'llama-3.3-70b-versatile';
    } else if (lovableKey) {
      apiKey = lovableKey;
      apiEndpoint = 'https://ai.gateway.lovable.dev/v1/chat/completions';
      modelName = 'google/gemini-2.5-flash';
    }

    if (!apiKey) {
      res.write(`data: ${JSON.stringify({ text: "AI service is not configured." })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
          tools,
          tool_choice: 'auto',
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        res.write(`data: ${JSON.stringify({ text: "I'm having trouble connecting right now. Please try again." })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      // Stream the response body directly to SSE client
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }

      res.end();
    } catch (err) {
      logger.error('[chatbot] Streaming error:', err);
      res.write(`data: ${JSON.stringify({ error: 'Streaming error occurred.' })}\n\n`);
      res.end();
    }
  }
);
