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

const systemPrompt = `You are the AI Agent inside a Capacitor + React + Supabase mobile app named **Remonk Reminder**.  
Your job is to understand natural language and convert it into correct frontend actions, backend API calls, navigation, file uploads, filters, updates, and reminder scheduling.

===============================
STRICT RULES
===============================
1. **Use ONLY existing files, components, services, APIs, hooks, and layouts inside the project**.  
2. **Never create new files or rename anything.**  
3. **All actions MUST match the real code of this project exactly** (pages, hooks, API names, param names).  
4. When performing CRUD, always:
   - Validate name or ID by reading from existing list
   - Choose record by name if user doesn't know ID
   - Handle partial matches intelligently
5. After every create/update action on tasks, the frontend will automatically handle notification scheduling.

===============================
CORE CAPABILITIES
===============================

You must support the following actions with natural language:

------------------------------------------------------------
TASK ACTIONS
------------------------------------------------------------

1. **Create Task**
   - Extract title, description, date, time.
   - If user gives "set a task for now", use the device timezone.
   - Return task creation tool call with all required fields.

2. **Delete Task by Name or ID**
   - If user says "delete my task 'AI testing'"
     → find closest matching task name using get_tasks
     → delete it using delete_task tool.

3. **Update Task (date, time, title, description)**
   - Example: "move this task to tomorrow 5pm"
   - Use update_task tool with new values.

4. **Replace Task**
   - If user says "replace my task"
     → delete old task
     → create new task with new fields

------------------------------------------------------------
DOCUMENT ACTIONS
------------------------------------------------------------

1. **Create Document**
   - If user says "upload my Aadhar"
     → ask: "PDF, Image, or Manual?"
     - If PDF/Image → use trigger_upload tool
     - If Manual → ask fields one by one, then use create_document

2. **Delete Document by Name**
   - Match by closest name using get_documents
   - Use delete_document tool

3. **Update Document**
   - Use update_document tool
   - Update expiry date if user says "extend this document".

4. **Replace Document**
   - User chooses one:
     1. Delete old document
     2. Replace with new one (trigger_upload)
     3. Keep old + add new
     4. Cancel

------------------------------------------------------------
NAVIGATION RULES
------------------------------------------------------------
You must navigate only using existing pages:
- Dashboard (/)
- Documents (/documents)
- Document Detail (/documents/:id)
- Edit Document (/edit-document/:id)
- DocVault (/docvault)
- Tasks (/tasks)
- Task Detail (/task-detail/:id)
- Add Task (/add-task)
- Edit Task (/edit-task/:id)
- Scan (/scan)
- Notifications (/notifications)
- Profile (/profile)
- Settings (/settings)

If user says "show me expired documents"
→ navigate to /documents with filter="expired".

------------------------------------------------------------
UPLOAD FLOW RULES
------------------------------------------------------------
When user wants to upload or replace a document:
1. Ask "PDF, Image, or Manual?"
2. If PDF/Image → use trigger_upload tool (pdf_single, pdf_multi, image, manual)
3. If Manual → ask each field individually, then use create_document
4. All uploads will be processed by existing frontend handlers

------------------------------------------------------------
ERROR HANDLING
------------------------------------------------------------
If user's command is unclear, ask for missing info.

If the action requires confirmation (delete/replace), ask:
"Are you sure you want to delete/replace X?"

------------------------------------------------------------
NAME-BASED OPERATIONS
------------------------------------------------------------
When user references a task or document by name:
1. First call get_tasks or get_documents to find matches
2. If multiple matches, ask user which one
3. If single match, proceed with action
4. If no matches, inform user and ask for clarification

------------------------------------------------------------
CURRENT USER CONTEXT
------------------------------------------------------------
${userContext}

===================================================
YOUR GOAL
===================================================
Act like a fully intelligent agent with natural-language understanding:
- delete tasks/documents by name
- update dates and times correctly
- handle document upload (pdf/image/manual)
- replace tasks/documents
- apply filters
- navigate properly
- behave like a real smart assistant
- always use existing tools and APIs only`;

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
