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
      // Fetch user's documents
      const { data: userDocuments } = await supabase
        .from('documents')
        .select('id, name, document_type, expiry_date')
        .eq('user_id', user.id)
        .order('expiry_date', { ascending: true })
        .limit(20);

      // Fetch user's tasks
      const { data: userTasks } = await supabase
        .from('tasks')
        .select('id, title, task_date, start_time, status')
        .eq('user_id', user.id)
        .order('task_date', { ascending: true })
        .limit(20);

      if (userDocuments && userDocuments.length > 0) {
        userContext += `\n\nUser's documents (use these names for operations):\n${userDocuments.map(doc => 
          `- "${doc.name}" (${doc.document_type}): expires ${doc.expiry_date}, ID: ${doc.id}`
        ).join('\n')}`;
      }

      if (userTasks && userTasks.length > 0) {
        userContext += `\n\nUser's tasks (use these titles for operations):\n${userTasks.map(task => 
          `- "${task.title}": ${task.task_date}, status: ${task.status}, ID: ${task.id}`
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
4. **NAME-BASED OPERATIONS ARE REQUIRED**: When user mentions a task or document BY NAME:
   - Use the *_by_name tools (delete_task_by_name, update_task_by_name, delete_document_by_name, update_document_by_name)
   - These tools will find the record by name and handle disambiguation if multiple matches exist
   - NEVER ask user for ID - always resolve by name
5. After every create/update action on tasks, notifications will be automatically scheduled.

===============================
NATURAL LANGUAGE UNDERSTANDING
===============================

Recognize these command variations:

**CREATE commands**: "create", "add", "make", "new", "set up", "schedule", "remind me"
**UPDATE commands**: "update", "change", "modify", "edit", "replace", "move", "reschedule", "extend"
**DELETE commands**: "delete", "remove", "trash", "clear", "cancel", "drop"

Examples:
- "delete my task gym" → use delete_task_by_name with search_name="gym"
- "update document passport expiry to 21 dec" → use update_document_by_name with search_name="passport", expiry_date="2024-12-21"
- "change the time of meeting task to 4pm" → use update_task_by_name with search_name="meeting", start_time="16:00"
- "remove aadhaar document" → use delete_document_by_name with search_name="aadhaar"
- "edit gym workout task to 5pm tomorrow" → use update_task_by_name with search_name="gym workout", start_time="17:00"

===============================
CORE CAPABILITIES
===============================

TASK ACTIONS
------------
1. **Create Task**
   - Extract title, description, date, time from natural language
   - Use create_task tool with all required fields
   - Example: "remind me to call mom at 3pm tomorrow"

2. **Delete Task by Name**
   - Use delete_task_by_name tool with search_name parameter
   - Example: "delete my gym task" → delete_task_by_name(search_name="gym")

3. **Update Task by Name**
   - Use update_task_by_name tool with search_name and update fields
   - Example: "move my meeting to 4pm" → update_task_by_name(search_name="meeting", start_time="16:00")

DOCUMENT ACTIONS
----------------
1. **Create Document**
   - Ask user for type (PDF/Image/Manual) first
   - If Manual, collect: name, document_type, expiry_date
   - Use create_document tool

2. **Delete Document by Name**
   - Use delete_document_by_name tool
   - Example: "delete passport" → delete_document_by_name(search_name="passport")

3. **Update Document by Name**
   - Use update_document_by_name tool
   - Example: "extend passport expiry to dec 2026" → update_document_by_name(search_name="passport", expiry_date="2026-12-31")

===============================
CONFIRMATION FLOW
===============================
For destructive actions (delete/update), the frontend will show a confirmation.
When using *_by_name tools:
1. The tool will find matching records
2. If single match found, it asks for confirmation
3. User replies "yes" or "no" 
4. Action proceeds or cancels

You don't need to ask for confirmation in your response - the tools handle this.

===============================
NAVIGATION RULES
===============================
Available pages:
- Dashboard (/)
- Documents (/documents)
- DocVault (/docvault)
- Tasks (/tasks)
- Scan (/scan)
- Notifications (/notifications)
- Profile (/profile)

===============================
DATE/TIME PARSING
===============================
Parse natural language dates:
- "today" → current date
- "tomorrow" → current date + 1 day
- "next week" → current date + 7 days
- "dec 21" or "21 dec" → 2024-12-21 (or next year if past)
- "4pm" → 16:00
- "morning" → 09:00
- "afternoon" → 14:00
- "evening" → 18:00

===============================
CURRENT USER CONTEXT
===============================
${userContext}

Use the names and IDs above when the user refers to their tasks/documents. Match by name using ILIKE pattern matching.

===============================
RESPONSE GUIDELINES
===============================
- Be concise and helpful
- Confirm what action you're taking
- If multiple matches found, ask user to clarify
- If no matches found, inform user and suggest alternatives
- Use friendly, conversational tone`;

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
          description: "Fetch user's documents to see what exists",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Max number of documents to return (default 20)" }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "find_document_by_name",
          description: "Search for a document by name using fuzzy matching",
          parameters: {
            type: "object",
            properties: {
              search_name: { type: "string", description: "The name or partial name to search for" }
            },
            required: ["search_name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "find_task_by_name",
          description: "Search for a task by title using fuzzy matching",
          parameters: {
            type: "object",
            properties: {
              search_name: { type: "string", description: "The title or partial title to search for" }
            },
            required: ["search_name"]
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
          name: "update_document_by_name",
          description: "Update a document by searching for it by name. Finds the document first, then updates it.",
          parameters: {
            type: "object",
            properties: {
              search_name: { type: "string", description: "The document name or partial name to find" },
              name: { type: "string", description: "New name (optional)" },
              expiry_date: { type: "string", description: "New expiry date YYYY-MM-DD (optional)" },
              issuing_authority: { type: "string", description: "New issuing authority (optional)" },
              notes: { type: "string", description: "New notes (optional)" }
            },
            required: ["search_name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_document",
          description: "Update an existing document by ID (use update_document_by_name instead when user mentions name)",
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
          name: "delete_document_by_name",
          description: "Delete a document by searching for it by name. Finds the document first, confirms with user, then deletes.",
          parameters: {
            type: "object",
            properties: {
              search_name: { type: "string", description: "The document name or partial name to find and delete" }
            },
            required: ["search_name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_document",
          description: "Delete a document by ID (use delete_document_by_name instead when user mentions name)",
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
          description: "Fetch user's tasks to see what exists",
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
          description: "Create a new task. Parse natural language for date and time.",
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
          name: "update_task_by_name",
          description: "Update a task by searching for it by title/name. Finds the task first, then updates it.",
          parameters: {
            type: "object",
            properties: {
              search_name: { type: "string", description: "The task title or partial title to find" },
              title: { type: "string", description: "New title (optional)" },
              description: { type: "string", description: "New description (optional)" },
              task_date: { type: "string", description: "New date YYYY-MM-DD (optional)" },
              start_time: { type: "string", description: "New start time HH:MM (optional)" },
              end_time: { type: "string", description: "New end time HH:MM (optional)" },
              status: { type: "string", enum: ["pending", "completed", "cancelled"], description: "New status (optional)" }
            },
            required: ["search_name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_task",
          description: "Update an existing task by ID (use update_task_by_name instead when user mentions name)",
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
          name: "delete_task_by_name",
          description: "Delete a task by searching for it by title/name. Finds the task first, confirms with user, then deletes.",
          parameters: {
            type: "object",
            properties: {
              search_name: { type: "string", description: "The task title or partial title to find and delete" }
            },
            required: ["search_name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "delete_task",
          description: "Delete a task by ID (use delete_task_by_name instead when user mentions name)",
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
