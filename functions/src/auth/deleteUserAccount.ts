/**
 * deleteUserAccount — HTTPS Callable
 *
 * Deletes the calling user's Firebase Auth account.
 * The frontend (useAuth.tsx) is expected to delete all Firestore data first,
 * then call this function — matching the existing Supabase pattern.
 *
 * Replaces: supabase/functions/delete-user-account
 */

import { https, logger } from 'firebase-functions/v2';
import { adminAuth } from '../shared/admin';

export const deleteUserAccount = https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'You must be signed in to delete your account.');
    }

    const uid = request.auth.uid;

    try {
      await adminAuth.deleteUser(uid);
      logger.info(`[deleteUserAccount] Deleted auth user ${uid}`);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[deleteUserAccount] Failed to delete user ${uid}:`, msg);
      throw new https.HttpsError('internal', `Failed to delete account: ${msg}`);
    }
  }
);
