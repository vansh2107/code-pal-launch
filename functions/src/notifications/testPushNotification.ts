/**
 * testPushNotification — HTTPS Callable
 *
 * Sends a random funny test notification to the calling user.
 * Replaces: supabase/functions/test-push-notification
 */

import { https, logger } from 'firebase-functions/v2';
import { sendOneSignalNotificationDetailed } from '../shared/onesignal';
import { getFunnyNotification } from '../shared/funnyNotifications';

export const testPushNotification = https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid = request.auth.uid;
    const notification = getFunnyNotification('document_expiring');

    const result = await sendOneSignalNotificationDetailed({
      userId:  uid,
      title:   notification.title,
      message: notification.message,
    });

    logger.info(`[testPushNotification] Sent to ${uid}:`, result);
    return { success: result.success, message: result.reason ?? 'sent' };
  }
);
