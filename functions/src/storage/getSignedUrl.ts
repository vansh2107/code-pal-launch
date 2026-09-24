/**
 * functions/src/storage/getSignedUrl.ts
 *
 * getSignedUrl — HTTPS Callable (Phase 3 upgrade)
 *
 * Generates a time-limited signed URL for a Firebase Storage file using the
 * Firebase Admin SDK.  Exact equivalent of Supabase's createSignedUrl().
 *
 * Default TTL: 3600 seconds (1 hour) — matches src/utils/signedUrl.ts cache TTL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Security model
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. Caller must be authenticated (Firebase ID token in request.auth).
 *
 * 2. OWNER PATH — caller's UID appears as the second path segment:
 *      documents/{callerUid}/...
 *      tasks/{callerUid}/...
 *      avatars/{callerUid}/...
 *    → URL generated immediately.
 *
 * 3. ORG DOCUMENT PATH — path matches documents/{otherUid}/... and the
 *    caller is NOT the owner:
 *    → Look up the Firestore document whose imagePath matches storagePath.
 *    → Check that document.organizationId is set.
 *    → Check that the caller has a member document in
 *        organizations/{orgId}/members/{callerUid}.
 *    → If all checks pass, generate the URL.
 *    → Otherwise: permission-denied.
 *
 * 4. Admin SDK credentials are NEVER sent to the client.  The signed URL
 *    is generated entirely server-side and only the URL string is returned.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage rules remain strict
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage rules grant read ONLY to the file owner.  Org members always go
 * through this Cloud Function — Storage rules are NOT weakened.
 */

import { https, logger } from 'firebase-functions/v2';
import { adminDb, adminStorage } from '../shared/admin';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TTL_SECONDS = 3600;           // 1 hour — matches Supabase
const MIN_TTL_SECONDS     = 60;             // 1 minute
const MAX_TTL_SECONDS     = 7 * 24 * 3600;  // 7 days

// ─────────────────────────────────────────────────────────────────────────────
// Request / response types
// ─────────────────────────────────────────────────────────────────────────────

interface SignedUrlRequest {
  storagePath:       string;
  expiresInSeconds?: number;
}

interface SignedUrlResponse {
  signedUrl: string;
  expiresAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Path ownership helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a storage path (strip any leading slash). */
function normPath(p: string): string {
  return p.replace(/^\/+/, '');
}

/**
 * Returns the UID embedded in the path if the caller directly owns it,
 * or null if they do not.
 *
 * Owned patterns:
 *   documents/{uid}/...
 *   tasks/{uid}/...
 *   avatars/{uid}/...
 */
function ownerUidFromPath(path: string): string | null {
  const m = path.match(/^(?:documents|tasks|avatars)\/([^/]+)\//);
  return m ? m[1] : null;
}

/**
 * Returns the document owner UID if the path is under documents/{uid}/...
 * Used for the org-member check path.
 */
function docOwnerUidFromPath(path: string): string | null {
  const m = path.match(/^documents\/([^/]+)\//);
  return m ? m[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Org membership check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if:
 *   - A Firestore document owned by docOwnerUid has imagePath === storagePath
 *   - That document has an organizationId set
 *   - callerUid has a member doc in organizations/{orgId}/members/{callerUid}
 */
async function callerIsOrgMemberForPath(
  callerUid:    string,
  docOwnerUid:  string,
  storagePath:  string,
): Promise<boolean> {
  try {
    // Find the Firestore document whose imagePath matches
    const docsSnap = await adminDb
      .collection('users')
      .doc(docOwnerUid)
      .collection('documents')
      .where('imagePath', '==', storagePath)
      .limit(1)
      .get();

    if (docsSnap.empty) {
      logger.warn(`[getSignedUrl] No Firestore document found for imagePath=${storagePath}`);
      return false;
    }

    const docData = docsSnap.docs[0].data();
    const orgId: string | undefined = docData.organizationId;

    if (!orgId) {
      logger.warn(`[getSignedUrl] Document has no organizationId for path=${storagePath}`);
      return false;
    }

    // Check membership
    const memberRef = adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('members')
      .doc(callerUid);

    const memberSnap = await memberRef.get();
    return memberSnap.exists;
  } catch (err) {
    logger.error('[getSignedUrl] Org membership check error:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core URL generator
// ─────────────────────────────────────────────────────────────────────────────

async function generateSignedUrl(
  storagePath: string,
  ttlSeconds:  number,
): Promise<string> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const bucket    = adminStorage.bucket(); // default bucket
  const file      = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    action:  'read',
    expires: expiresAt,
  });

  return url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud Function
// ─────────────────────────────────────────────────────────────────────────────

export const getSignedUrl = https.onCall(
  { enforceAppCheck: false },
  async (request): Promise<SignedUrlResponse> => {
    // ── Auth ──────────────────────────────────────────────────────────────────
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const callerUid = request.auth.uid;
    const data      = request.data as SignedUrlRequest;

    // ── Input validation ──────────────────────────────────────────────────────
    if (!data.storagePath || typeof data.storagePath !== 'string') {
      throw new https.HttpsError('invalid-argument', 'storagePath is required.');
    }

    const path = normPath(data.storagePath);

    if (!path) {
      throw new https.HttpsError('invalid-argument', 'storagePath must not be empty.');
    }

    // ── TTL ───────────────────────────────────────────────────────────────────
    const ttl = Math.min(
      Math.max(data.expiresInSeconds ?? DEFAULT_TTL_SECONDS, MIN_TTL_SECONDS),
      MAX_TTL_SECONDS,
    );

    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    // ── Ownership check — direct owner ────────────────────────────────────────
    const pathOwnerUid = ownerUidFromPath(path);

    if (pathOwnerUid === callerUid) {
      // Fast path: caller owns the file
      try {
        const signedUrl = await generateSignedUrl(path, ttl);
        logger.info(`[getSignedUrl] Owner access: uid=${callerUid} path=${path} ttl=${ttl}s`);
        return { signedUrl, expiresAt };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[getSignedUrl] Generation failed for ${path}:`, msg);
        throw new https.HttpsError('internal', `Failed to generate signed URL: ${msg}`);
      }
    }

    // ── Org membership check — document files only ───────────────────────────
    const docOwnerUid = docOwnerUidFromPath(path);

    if (docOwnerUid) {
      const isMember = await callerIsOrgMemberForPath(callerUid, docOwnerUid, path);

      if (isMember) {
        try {
          const signedUrl = await generateSignedUrl(path, ttl);
          logger.info(
            `[getSignedUrl] Org-member access: caller=${callerUid} owner=${docOwnerUid} path=${path}`,
          );
          return { signedUrl, expiresAt };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`[getSignedUrl] Generation failed for org path ${path}:`, msg);
          throw new https.HttpsError('internal', `Failed to generate signed URL: ${msg}`);
        }
      }
    }

    // ── Denied ────────────────────────────────────────────────────────────────
    logger.warn(
      `[getSignedUrl] Permission denied: caller=${callerUid} path=${path}`,
    );
    throw new https.HttpsError(
      'permission-denied',
      'You do not have access to this file.',
    );
  },
);
