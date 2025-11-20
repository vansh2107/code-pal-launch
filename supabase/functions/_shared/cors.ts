export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function handleCorsOptions(): Response {
  return new Response(null, { headers: corsHeaders });
}

export function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function createErrorResponse(error: Error | string, status = 500): Response {
  const message = error instanceof Error ? error.message : error;
  return createJsonResponse({ success: false, error: message }, status);
}
