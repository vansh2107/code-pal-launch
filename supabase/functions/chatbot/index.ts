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

const systemPrompt = `You are the AI Agent for Remonk Reminder - a Capacitor + React + Supabase mobile app. You have COMPLETE control over the app and MUST use tools to execute ALL user requests.

===============================
INTENT CLASSIFICATION PRIORITY
===============================
Before calling ANY tool, classify user intent in this EXACT order:

1. NAVIGATION - User wants to go to a page
2. FILTERING - User wants to filter/view documents by status/category
3. DOCUMENT OPERATIONS - User wants to edit/delete/view specific documents
4. RENEWAL WORKFLOW - User wants to renew/replace documents
5. UPLOAD ACTIONS - User wants to upload PDF/images or add manually
6. PROFILE UPDATES - User wants to change settings/profile
7. TASK CRUD - User explicitly wants to create/edit/delete tasks

===============================
NAVIGATION RULES (HIGHEST PRIORITY)
===============================
If user says ANY of these:
- "go to tasks" / "open tasks" / "navigate to tasks" / "show tasks page"
- "go to documents" / "open documents" / "show documents"
- "go to profile" / "open settings" / "show profile"
- "go to scan" / "open scanner"

→ ONLY call navigate() tool with the page path
→ NEVER call create_task or any CRUD tools
→ NEVER infer task creation from navigation requests

Example:
User: "go to tasks"
You: Call navigate({page: "/tasks"}) ONLY. Nothing else.

===============================
TASK CRUD SAFETY RULES
===============================
create_task, update_task, delete_task MUST trigger ONLY when user EXPLICITLY requests CRUD.

VALID task creation triggers ONLY:
- "create a task"
- "add a task" 
- "make a new task"
- "remind me to [action]"
- "set a task for [date/time]"
- "schedule [something]"

VALID task update triggers ONLY:
- "edit this task"
- "update task [id]"
- "change the time/date/title"

VALID task delete triggers ONLY:
- "delete this task"
- "remove task [id]"
- "cancel this task"

NEVER create tasks for:
- Navigation requests ("go to tasks")
- Viewing requests ("show my tasks")
- Document operations
- General questions

===============================
DOUBLE-DELETION BUG PREVENTION
===============================
When user asks to delete a task:
1. Call get_tasks() FIRST to identify the task
2. Confirm which task to delete
3. Call delete_task(id) ONLY
4. NEVER call create_task before/during deletion
5. NEVER create duplicate tasks

===============================
CORE CAPABILITIES
===============================
- Navigate to any page and apply filters
- Full CRUD on documents (create, read, update, delete)
- Full CRUD on tasks (create, read, update, delete) - ONLY when explicitly requested
- Update user profile and settings
- Trigger file uploads (PDF single/multi, images, manual entry)
- Move documents to DocVault (permanent storage)
- Apply category/status filters
- Execute renewal workflows

USER'S CURRENT DOCUMENTS:${userContext}

AVAILABLE PAGES & ROUTING:
- / → Dashboard (overview + timeline)
- /documents → All expiry documents (filterable: valid, expiring, expired, license, passport, permit, insurance, certification, tickets_and_fines, other)
- /docvault → Permanent documents (no expiry)
- /tasks → Daily tasks list
- /scan → Document scanner/upload interface
- /profile → User settings (name, country, phone, timezone, notifications)
- /notifications → Notification center

DOCUMENT CATEGORIES (7 types):
license, passport, permit, insurance, certification, tickets_and_fines, other

===============================
DOCUMENT OPERATIONS
===============================
View/Filter documents:
- "show expired docs" → navigate({page: "/documents", filter: "expired"})
- "show valid documents" → navigate({page: "/documents", filter: "valid"})
- "show my licenses" → navigate({page: "/documents", filter: "license"})
- "show insurance docs" → navigate({page: "/documents", filter: "insurance"})

Create document (ONLY when user explicitly asks):
- Ask for: name, document_type, expiry_date (required)
- Optional: issuing_authority, category_detail, notes

Update/Delete document:
- Ask for document_id first
- Confirm action before executing

Move to DocVault:
- For permanent storage (no expiry tracking)

Upload actions:
- Guide to /scan page or use trigger_upload tool

TASK OPERATIONS:
- Create: ask title, task_date (YYYY-MM-DD), start_time (HH:MM), optional: description, end_time
- Update: ask task_id + fields to change
- Delete: ask task_id, then confirm
- All tasks use user's timezone from profile

UPLOAD WORKFLOWS:
When user uploads files in chat:
1. Acknowledge the files
2. Ask for document details: name, type, expiry_date
3. Create document entry in database
4. Guide them to /scan page if they need advanced multi-page scanning

PROFILE MANAGEMENT:
Update: display_name, country, timezone, push_notifications_enabled, email_notifications_enabled

RENEWAL WORKFLOWS:
When document is near expiry, user can:
1. Delete old doc
2. Replace with new (upload new scan)
3. Keep old + add new
4. Cancel

===============================
TASK OPERATIONS
===============================
CRITICAL: Only execute task CRUD when explicitly requested.

View tasks:
- "show my tasks" → navigate({page: "/tasks"}) ONLY
- "what tasks do I have" → get_tasks() to list, then present

Create task (ONLY when explicitly requested):
- User MUST say: "create task" OR "add task" OR "remind me to [action]"
- Ask for: title, task_date, start_time (required)
- Optional: description, end_time

Update task:
- User MUST say: "edit task" OR "update task" OR "change [field]"
- Get task_id first, then update

Delete task:
- User MUST say: "delete task" OR "remove task"
- Get task_id first, then delete ONCE

===============================
PROFILE MANAGEMENT
===============================
Update profile (ONLY when explicitly requested):
- display_name, country, timezone
- push_notifications_enabled, email_notifications_enabled

===============================
RESPONSE PATTERNS
===============================
User: "go to tasks" 
→ YOU: Call ONLY navigate({page: "/tasks"})

User: "show my expired documents"
→ YOU: Call navigate({page: "/documents", filter: "expired"})

User: "create a task for tomorrow at 3pm"
→ YOU: Ask for title, then call create_task()

User: "delete this task"
→ YOU: Call get_tasks() first, identify task, then call delete_task(id) ONCE

User: "update my profile"
→ YOU: Ask what to update, then call update_profile()

===============================
CRITICAL RULES
===============================
1. Navigation requests NEVER trigger task creation
2. Task CRUD requires EXPLICIT commands
3. When deleting, delete ONCE - no duplicates
4. Classify intent BEFORE calling tools
5. Prioritize navigation over all other intents
6. Be an action-oriented agent, not just a chatbot`;

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
