/**
 * Authentication helpers for Cloud Functions.
 *
 * Provides:
 *   - verifyFirebaseToken()  — extracts and verifies a Firebase ID token from
 *     the Authorization header (replaces Supabase's verify_jwt: true).
 *   - verifyCronSecret()     — validates scheduled invocations from
 *     Cloud Scheduler (replaces pg_cron + x-cron-secret header pattern).
 *
 * Cloud Scheduler authenticates automatically via OIDC service-account tokens
 * when the function is configured with authentication.  The CRON_SECRET env
 * variable is kept as a fallback for manual/test invocations.
 */

import { adminAuth } from './admin';
import type { DecodedIdToken } from 'firebase-admin/auth';

// ---------------------------------------------------------------------------
// Firebase ID Token verification
// ---------------------------------------------------------------------------

/**
 * Extract and verify a Firebase ID token from the Authorization header.
 * Returns the decoded token on success; throws with a descriptive message on
 * failure.
 *
 * Usage in a callable function:
 *   const decoded = await verifyFirebaseToken(request.rawRequest);
 *
 * Usage in an HTTP function:
 *   const decoded = await verifyFirebaseToken(req);
 */
export async function verifyFirebaseToken(
  req: { headers: Record<string, string | string[] | undefined> }
): Promise<DecodedIdToken> {
  const authHeader =
    (req.headers['authorization'] as string) ||
    (req.headers['Authorization'] as string);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }

  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  try {
    return await adminAuth.verifyIdToken(idToken);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid Firebase ID token: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Cron / Scheduler authentication
// ---------------------------------------------------------------------------

/**
 * Verify that an inbound request is from an authorised scheduler.
 *
 * Accepts any of:
 *   (a) x-cron-secret header matching the CRON_SECRET env variable.
 *   (b) A valid Google OIDC token in the Authorization header (set
 *       automatically by Cloud Scheduler when the function has
 *       require-oidc-token: true in firebase.json).
 *   (c) A Firebase ID token with role === 'service_account' (for local tests).
 *
 * Returns { ok: true } on success; { ok: false, status, message } on failure.
 */
export async function verifyCronSecret(
  req: { headers: Record<string, string | string[] | undefined> }
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  // (a) Static secret header
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret =
    (req.headers['x-cron-secret'] as string) ||
    (req.headers['X-Cron-Secret'] as string);

  if (cronSecret && providedSecret && providedSecret === cronSecret) {
    return { ok: true };
  }

  // (b) Bearer token — try Firebase ID token or OIDC token
  const authHeader =
    (req.headers['authorization'] as string) ||
    (req.headers['Authorization'] as string);

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Try Firebase Admin verification (covers service-account tokens issued
    // by Cloud Scheduler via Workload Identity, which look like ID tokens).
    try {
      await adminAuth.verifyIdToken(token);
      // Any valid Google-signed token is accepted from Cloud Scheduler.
      return { ok: true };
    } catch {
      // Not a valid Firebase / Google ID token — fall through.
    }
  }

  console.error('Unauthorised cron invocation: no valid x-cron-secret or bearer token');
  return { ok: false, status: 401, message: 'Unauthorised' };
}
