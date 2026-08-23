const ALLOWED_ORIGINS = [
  'https://arc-web-creator.lovable.app',
  'https://id-preview--ecd586e9-7f72-40c2-b6f8-60a8662d5bae.lovable.app',
  'https://ecd586e9-7f72-40c2-b6f8-60a8662d5bae.lovableproject.com',
  'http://localhost:5173',
  'http://localhost:8080',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

/** @deprecated Use getCorsHeaders(req) instead for origin-aware CORS */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function handleCorsOptions(req?: Request): Response {
  return new Response(null, { headers: getCorsHeaders(req) });
}

export function createJsonResponse(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

export function createErrorResponse(error: Error | string, status = 500, req?: Request): Response {
  const message = error instanceof Error ? error.message : error;
  return createJsonResponse({ success: false, error: message }, status, req);
}
