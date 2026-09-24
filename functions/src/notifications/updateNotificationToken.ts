/**
 * updateNotificationToken — HTTPS Callable
 *
 * Upserts a OneSignal subscription ID into the user's
 * notification_tokens sub-collection and ensures push_notifications_enabled
 * is set to true on their profile.
 *
 * Replaces: supabase/functions/update-notification-token
 */

import { https, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { profilePath } from '../shared/database';
import { FieldValue } from 'firebase-admin/firestore';

interface RequestData {
  token: string;
  provider: 'onesignal' | 'fcm';
  deviceInfo?: string;
}

export const updateNotificationToken = https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = request.auth.uid;
    const { token, provider, deviceInfo } = request.data as RequestData;

    if (!token || typeof token !== 'string') {
      throw new https.HttpsError('invalid-argument', 'token is required.');
    }
    if (!provider) {
      throw new https.HttpsError('invalid-argument', 'provider is required.');
    }

    const now = new Date().toISOString();
    const tokenRef = adminDb
      .collection('users')
      .doc(uid)
      .collection('notification_tokens')
      .doc(token);   // use token as doc ID for easy upsert / dedup

    try {
      await tokenRef.set(
        {
          id:         token,
          userId:     uid,
          token,
          provider,
          deviceInfo: deviceInfo ?? null,
          updatedAt:  now,
          createdAt:  FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Ensure push preference is enabled on profile
      await adminDb
        .doc(profilePath(uid))
        .set({ pushNotificationsEnabled: true, updatedAt: now }, { merge: true });

      logger.info(`[updateNotificationToken] Upserted token for ${uid}`);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[updateNotificationToken] Failed for ${uid}:`, msg);
      throw new https.HttpsError('internal', msg);
    }
  }
);
