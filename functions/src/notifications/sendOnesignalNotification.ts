/**
 * sendOnesignalNotification — HTTPS Callable
 *
 * Sends a OneSignal push notification.
 * Auth: must supply own userId OR have a valid cron secret (admin use).
 *
 * Replaces: supabase/functions/send-onesignal-notification
 */

import { https, logger } from 'firebase-functions/v2';
import { sendOneSignalNotificationDetailed } from '../shared/onesignal';
import { onesignalSecrets } from '../shared/secrets';
import type { NotificationPayload } from '../shared/types';

export const sendOnesignalNotification = https.onCall(
  { enforceAppCheck: false, secrets: onesignalSecrets },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const data = request.data as Partial<NotificationPayload>;

    // Non-admin callers may only send to themselves.
    const targetUserId = data.userId ?? request.auth.uid;
    if (targetUserId !== request.auth.uid) {
      throw new https.HttpsError('permission-denied', 'You can only send notifications to yourself.');
    }

    if (!data.title || !data.message) {
      throw new https.HttpsError('invalid-argument', 'title and message are required.');
    }

    const payload: NotificationPayload = {
      userId:  targetUserId,
      title:   data.title,
      message: data.message,
      data:    data.data,
      buttons: data.buttons,
      url:     data.url,
    };

    const result = await sendOneSignalNotificationDetailed(payload);
    logger.info(`[sendOnesignalNotification] Result for ${targetUserId}:`, result);
    return result;
  }
);
