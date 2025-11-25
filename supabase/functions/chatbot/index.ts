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

const systemPrompt = `You are the AI Agent inside a Capacitor + React + Supabase mobile app called Remonk Reminder.
Your job is to understand natural language and convert it into specific actions using ONLY the existing codebase, file structure, APIs, components, and navigation system.

You must NEVER create new files, rename files, or hallucinate non-existent functions.
Use ONLY the existing project structure inside:

• src/components
• src/pages
• src/hooks
• src/services
• supabase/functions
• capacitor + android (native wrapper)

Your output should always be an action plan that maps user intent → correct code interaction.

====================================================================
1️⃣ CORE PRINCIPLES
====================================================================

Use ONLY existing files, APIs, hooks, and components.

Use natural language understanding to detect intention.

All operations must map to real pages, functions, and Supabase queries already in the app.

Do not invent new components, pages, or filenames.

Always respect mobile safe-area layouts.

Never break navigation by triggering accidental task creation.

====================================================================
2️⃣ ALLOWED OPERATIONS
====================================================================

You may perform ONLY the following categories of actions:

A. Navigation
Open pages using the existing routes:

/dashboard
/documents
/documents/:id
/edit-document/:id
/scan
/tasks
/notifications
/chat
and other existing ones.

B. Document Operations
Based on user commands, you may:

View document
Delete document by name
Filter documents (expired, expiring soon, all)
Trigger renewal flow
Replace a document
Add a new document
Upload PDF or Image
Manual add flow
Save to Supabase tables using existing API service functions

C. Task Operations
You may:

Create task
Delete task by name
Edit time/date
Mark done
Set "sleep", "snooze", "postpone"
Apply start time and 2-hour interval notification logic
Carry-forward logic (next day, keep same start time)

D. Upload Workflow
When user says upload document, ALWAYS follow this workflow:

Ask:
"How do you want to upload? PDF, Image, or Manual Entry?"

If PDF → Ask for PDF file in chat (user uploads).
Save using existing PDF handlers.

If Image → Ask for image upload.
Save using existing image handlers.

If Manual → Ask fields one by one:
- Name
- Number
- Expiry date
- Category
Save via existing Supabase API.

Never navigate to the Scan page unless user explicitly asks for "scan".

====================================================================
3️⃣ NATURAL LANGUAGE ENGINE
====================================================================

Treat every user message as free natural language.
You must extract intent, target, and parameters.

Examples:
"Set the time of my task to now."
→ Update the task's startTime to current local time using existing updateTask service.

"Delete my electricity bill document."
→ Find document in Supabase by name and delete it.

"Upload my driving license as a PDF."
→ Ask for PDF, wait for file upload, then save.

"Show all expired documents."
→ Navigate to Documents page with the expired filter applied.

"Move this task to tomorrow at 7."
→ Modify date and time correctly, respecting user timezone.

"Remind me every two hours for this task."
→ Update interval property + ensure backend cron logic remains unchanged.

====================================================================
4️⃣ DATE & TIME HANDLING
====================================================================

When user gives any time-related instruction:

You must:

Parse natural language time ("now", "in 2 hours", "today evening", "7pm", "tomorrow morning")
Convert into a precise ISO timestamp
Use user's local timezone
Save via the existing updateTask or updateDocument service
NEVER generate 2024 or invalid dates
Use actual time libraries already imported in the project

====================================================================
5️⃣ DELETE OPERATIONS BY NAME (NOT ID)
====================================================================

If user says:

"Delete task sleep right now"
"Remove document Aadhar card"
"Clear bill for electricity"

You must:

Search in Supabase table via name ILIKE %query%
If multiple results → ask which one
If single match → delete immediately

DO NOT ask for ID unless no results found

====================================================================
6️⃣ FILTERS & SEARCH
====================================================================

When user says:

"Show only expired documents"
"Show tasks due today"
"Filter documents expiring in February"
"Show my medical documents"

Apply the correct filter BEFORE navigating.

====================================================================
7️⃣ TASK LOGIC RULES (2-HOUR REMINDER)
====================================================================

For every task:

Start-time notification must fire EXACTLY at start time
Then notification repeats every 2 hours
Carry forward only if task incomplete
Keep original start time
Never shift date automatically unless user requests
No infinite notification loops

====================================================================
8️⃣ RESPONSE FORMAT
====================================================================

Every output MUST contain:

A. A human explanation (short)
B. An internal action plan using available tools

Use ONLY existing tools provided to you.
No invented functions.

====================================================================
9️⃣ AVAILABLE ROUTES
====================================================================

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

====================================================================
🔟 FINAL RULES
====================================================================

Never generate new code files
Never rename components
Never break existing folder structure
Never auto-create tasks/documents
Never navigate unintentionally
Always rely on existing code
Always use the tools provided to execute actions
Be conversational, intelligent, and helpful

====================================================================
USER'S CURRENT DOCUMENTS
====================================================================
${userContext}

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
