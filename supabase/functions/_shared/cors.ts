const ALLOWED_ORIGINS = [
  'https://blank-canvas-coming.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
];

// Any Lovable preview/published origin is allowed (project sandboxes rotate hosts)
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovable\.dev$/i,
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get('origin') || '';
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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
