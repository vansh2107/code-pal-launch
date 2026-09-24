/**
 * CORS configuration for Cloud Functions HTTP endpoints.
 *
 * Allows requests from:
 *   - Lovable preview and production domains
 *   - Local development servers
 *   - Capacitor WebView (capacitor://localhost)
 */

const ALLOWED_ORIGINS = new Set([
  'https://lovable.app',
  'https://lovableproject.com',
  'https://lovableproject-dev.com',
  'https://gpt-eng.com',
  'https://gptengineer.run',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'capacitor://localhost',
  'https://localhost',
]);

export function getCorsHeaders(origin: string | undefined): Record<string, string> {
  const allowed =
    origin &&
    (ALLOWED_ORIGINS.has(origin) ||
      origin.endsWith('.lovableproject.com') ||
      origin.endsWith('.lovable.app') ||
      origin.endsWith('.gptengineer.run'));

  return {
    'Access-Control-Allow-Origin': allowed ? origin! : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cron-secret',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCors(
  req: { method: string; headers: { origin?: string; get?: (h: string) => string | null } },
  res: { set: (h: Record<string, string>) => void; status: (c: number) => { send: (b: string) => void } }
): boolean {
  const origin =
    typeof req.headers.get === 'function'
      ? req.headers.get('origin') ?? undefined
      : (req.headers as Record<string, string>).origin;

  res.set(getCorsHeaders(origin));

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true; // caller should return immediately
  }
  return false;
}
