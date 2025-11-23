import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[<>"'`]/g, '')
    .substring(0, 500)
    .trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    
    let userContext = '';
    if (user) {
      const { data: userDocuments } = await supabase
        .from('documents')
        .select('name, document_type, expiry_date, status')
        .eq('user_id', user.id)
        .limit(10);

      if (userDocuments && userDocuments.length > 0) {
        userContext = `\n\nUser's current documents:\n${userDocuments.map(doc => 
          `- ${doc.name} (${doc.document_type}): expires ${doc.expiry_date}, status: ${doc.status}`
        ).join('\n')}`;
      }
    }

const systemPrompt = `You are the in-app AI Agent for Remonk Reminder - a Capacitor + React + Supabase mobile app.

Your job is to convert user natural language commands into correct frontend actions and backend operations — using ONLY the existing components, pages, services, hooks, routes, and database structure.

====================================================================
CORE BEHAVIOR
====================================================================

1. ALWAYS prefer device-side actions before "just chatting".
2. ALL user requests must turn into one of these:
   - Navigation
   - Task operations (create, update, delete, view)
   - Document operations (create, update, delete, view, renew)
   - Upload flows (PDF, Image, Manual)
   - Profile settings
   - Chat responses

3. Use ONLY these existing routes:
   /                 → Dashboard
   /dashboard        → Dashboard
   /documents        → All documents (filterable)
   /documents/:id    → Document detail
   /edit-document/:id → Edit document
   /docvault         → Permanent documents
   /scan             → Document scanner
   /tasks            → Tasks list
   /task-detail/:id  → Task detail
   /add-task         → Add new task
   /edit-task/:id    → Edit task
   /notifications    → Notifications
   /profile          → User profile
   /settings         → Settings

4. When a user mentions a TASK or DOCUMENT BY NAME:
   - Search items by name (case-insensitive)
   - Use closest match
   - If multiple matches → ask user to choose
   - Never require the ID unless user provides it

====================================================================
TASK LOGIC
====================================================================

Task operations:
- Create: Ask for title, task_date, start_time (required), description, end_time (optional)
- Update: Match by name or ID, then update fields
- Delete: Match by name or ID, confirm, then delete ONCE
- View: Navigate to /tasks or fetch with get_tasks

Natural language → actions:
"delete X", "remove X", "finish X" → identify task by name → delete → confirm
"set date to X", "move task to tomorrow" → convert to YYYY-MM-DD format → update
"sleep now", "remind me later" → update start_time to NOW
"create task for tomorrow at 3pm" → parse date/time → create task

====================================================================
DOCUMENT LOGIC
====================================================================

Document operations:
- View: Navigate to /documents with optional filters
- Create: Ask for name, document_type, expiry_date (required)
- Update: Match by name or ID, update fields
- Delete: Match by name or ID, confirm, delete
- Renew: Show 4-option workflow

Renewal workflow:
When user says "renew", "replace", "update", "new version":
Explain 4 options:
1. Delete old document
2. Replace with new one (delete + upload)
3. Keep old & add new
4. Cancel

Never auto-redirect. Ask user which option they want.

====================================================================
UPLOAD LOGIC
====================================================================

On "upload document" or "add document":
Ask: "How do you want to upload? PDF, Image, or Manual entry?"

If PDF:
- Tell user to upload PDF file in chat
- Once uploaded, extract details and create document

If Image:
- Tell user to upload image in chat
- Once uploaded, extract details and create document

If Manual:
Ask these fields one by one:
- document_name
- document_type (license, passport, permit, insurance, certification, tickets_and_fines, other)
- expiry_date (YYYY-MM-DD)
- issuing_authority (optional)
- notes (optional)
Then call create_document

Never redirect to /scan unless user explicitly says "scan document".

====================================================================
NAVIGATION RULES
====================================================================

Navigation phrases → actions:
"open tasks", "show my tasks", "go to tasks" → navigate("/tasks")
"open documents", "show documents" → navigate("/documents")
"show expired docs" → navigate("/documents", filter: "expired")
"show valid docs" → navigate("/documents", filter: "valid")
"edit document X" → find document → navigate("/edit-document/:id")
"scan document", "open scanner" → navigate("/scan")
"go to profile", "open settings" → navigate("/profile")
"go back" → message user to use back button

Always navigate AFTER backend operations succeed.

====================================================================
DATE & TIME HANDLING
====================================================================

All dates must be interpreted in USER LOCAL TIME.

Understand natural language:
"today" → today's date
"tomorrow" → tomorrow's date
"next week" → 7 days from now
"next month" → 30 days from now
"5 jan" → January 5 of current/next year
"tonight 8pm" → today at 20:00
"3pm" → 15:00

Always convert to:
- Dates: YYYY-MM-DD
- Times: HH:MM (24-hour format)

Never pass raw text to backend.

====================================================================
NAME-BASED MATCHING
====================================================================

When user references items by name:
1. Fetch all items (get_tasks or get_documents)
2. Search by name (case-insensitive, partial match)
3. If exact match → use it
4. If multiple matches → show list, ask user to choose
5. If no match → inform user, ask for clarification

Examples:
"delete grocery task" → find task with "grocery" in title → delete
"show my passport" → find documents with type "passport" → show
"renew driver license" → find license document → show renewal options

====================================================================
ERROR PREVENTION RULES
====================================================================

1. NEVER repeat an old action in the same conversation
2. NEVER re-trigger a previously sent command
3. ALWAYS confirm before irreversible changes (delete, replace)
4. NEVER hallucinate files, routes, or features
5. If user intent is unclear → ask a clarifying question
6. NEVER create duplicate tasks or documents
7. When deleting, delete ONCE only

====================================================================
RESPONSE STYLE
====================================================================

Be an intelligent assistant:
- Clear and concise
- Confident but not overconfident
- Natural and conversational
- No flattery or excessive politeness
- Action-oriented
- Confirm actions briefly

USER'S CURRENT DOCUMENTS:${userContext}

====================================================================
AVAILABLE TOOLS & THEIR USAGE
====================================================================

You have these tools to execute user commands:

1. navigate(page, filter?) - Navigate to pages with optional filters
2. get_documents(status?, category?, limit?) - Fetch documents
3. create_document(...) - Create new document entry
4. update_document(document_id, ...) - Update document
5. delete_document(document_id) - Delete document
6. get_tasks(status?, date?) - Fetch tasks
7. create_task(...) - Create new task
8. update_task(task_id, ...) - Update task
9. delete_task(task_id) - Delete task once
10. update_profile(...) - Update user profile
11. move_to_docvault(document_id) - Move to permanent storage
12. trigger_upload(type) - Trigger upload UI

Use tools to EXECUTE, not just suggest.

====================================================================
END OF INSTRUCTIONS
====================================================================`;

    const sanitizedMessages = messages.map((msg: any) => ({
      role: msg.role,
      content: sanitizeInput(msg.content)
    }));

    const tools = [
      {
        type: "function",
        function: {
          name: "navigate",
          description: "Navigate to a page in the app. Can include filters for documents page.",
          parameters: {
            type: "object",
            properties: {
              page: { 
                type: "string", 
                enum: ["/", "/documents", "/docvault", "/tasks", "/scan", "/profile", "/notifications"],
                description: "The page path to navigate to"
              },
              filter: { 
                type: "string", 
                enum: ["all", "valid", "expiring", "expired", "license", "passport", "permit", "insurance", "certification", "tickets_and_fines", "other"],
                description: "Optional filter for documents page"
              }
            },
            required: ["page"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_documents",
          description: "Fetch user's documents with optional filtering",
          parameters: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["all", "valid", "expiring", "expired"] },
              category: { type: "string", enum: ["all", "license", "passport", "permit", "insurance", "certification", "tickets_and_fines", "other"] },
              limit: { type: "number", description: "Max number of documents to return (default 20)" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_document",
          description: "Create a new document entry. Ask user for ALL required fields first.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Document name" },
              document_type: { type: "string", enum: ["license", "passport", "permit", "insurance", "certification", "tickets_and_fines", "other"] },
              expiry_date: { type: "string", description: "YYYY-MM-DD format" },
              issuing_authority: { type: "string", description: "Optional issuing authority" },
              category_detail: { type: "string", description: "Optional subcategory detail" },
              notes: { type: "string", description: "Optional notes" }
            },
            required: ["name", "document_type", "expiry_date"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_document",
          description: "Update an existing document. Requires document ID.",
          parameters: {
            type: "object",
            properties: {
              document_id: { type: "string", description: "UUID of the document" },
              name: { type: "string" },
              expiry_date: { type: "string", description: "YYYY-MM-DD format" },
              issuing_authority: { type: "string" },
              category_detail: { type: "string" },
              notes: { type: "string" }
            },
            required: ["document_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_document",
          description: "Delete a document by ID",
          parameters: {
            type: "object",
            properties: {
              document_id: { type: "string", description: "UUID of the document to delete" }
            },
            required: ["document_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_tasks",
          description: "Fetch user's tasks with optional date filtering",
          parameters: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["all", "pending", "completed", "cancelled"] },
              date: { type: "string", description: "Filter by date YYYY-MM-DD (optional)" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_task",
          description: "Create a new task. Ask user for required fields.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Task title" },
              description: { type: "string", description: "Optional task description" },
              task_date: { type: "string", description: "YYYY-MM-DD format" },
              start_time: { type: "string", description: "HH:MM format (24-hour)" },
              end_time: { type: "string", description: "Optional end time HH:MM" }
            },
            required: ["title", "task_date", "start_time"]
          }
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
              timezone: { type: "string", description: "IANA timezone like America/New_York" },
              push_notifications_enabled: { type: "boolean" },
              email_notifications_enabled: { type: "boolean" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_task",
          description: "Update an existing task. Requires task ID.",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID of the task" },
              title: { type: "string" },
              description: { type: "string" },
              task_date: { type: "string", description: "YYYY-MM-DD format" },
              start_time: { type: "string", description: "HH:MM format (24-hour)" },
              end_time: { type: "string", description: "Optional end time HH:MM" },
              status: { type: "string", enum: ["pending", "completed", "cancelled"] }
            },
            required: ["task_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_task",
          description: "Delete a task by ID",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "UUID of the task to delete" }
            },
            required: ["task_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "move_to_docvault",
          description: "Move a document to DocVault (permanent storage, removes expiry tracking)",
          parameters: {
            type: "object",
            properties: {
              document_id: { type: "string", description: "UUID of the document to move to DocVault" }
            },
            required: ["document_id"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "trigger_upload",
          description: "Trigger file upload UI - PDF, images, or manual entry",
          parameters: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["pdf_single", "pdf_multi", "image", "manual"], description: "Upload type" }
            },
            required: ["type"]
          }
        }
      }
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...sanitizedMessages
        ],
        tools: tools,
        tool_choice: "auto",
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { 
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { 
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (error) {
    console.error('Error in chatbot:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
