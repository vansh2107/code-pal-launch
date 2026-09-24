/**
 * AI Provider Helper
 *
 * Supports Gemini -> Groq -> Lovable AI Gateway provider fallback chain.
 * Server-side secrets accessed via process.env.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | any[];
}

export interface AiCompletionOptions {
  messages: ChatMessage[];
  systemPrompt?: string;
  tools?: any[];
  toolChoice?: any;
  temperature?: number;
}

export async function getAiCompletion(options: AiCompletionOptions): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
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

  if (!apiKey) return null;

  try {
    const formattedMessages = [...options.messages];
    if (options.systemPrompt && !formattedMessages.some(m => m.role === 'system')) {
      formattedMessages.unshift({ role: 'system', content: options.systemPrompt });
    }

    const body: Record<string, unknown> = {
      model: modelName,
      messages: formattedMessages,
    };
    if (options.tools) body.tools = options.tools;
    if (options.toolChoice) body.tool_choice = options.toolChoice;

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as any;
    if (data.choices?.[0]?.message?.tool_calls?.[0]) {
      return data.choices[0].message.tool_calls[0].function.arguments;
    }
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn('[AI Provider] Error calling AI completion:', err);
    return null;
  }
}
