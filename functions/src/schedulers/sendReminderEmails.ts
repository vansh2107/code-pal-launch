/**
 * sendReminderEmails — Scheduled Function (also callable for test page)
 *
 * Runs every hour. Filters eligible users by timezone match.
 * Sends expiry-themed funny emails + OneSignal push for documents due today.
 *
 * Replaces: supabase/functions/send-reminder-emails
 */

import { scheduler, https, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { sendEmail } from '../shared/sendgrid';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getDateInTimezone, isTimeMatching } from '../shared/timezone';

async function runSendReminderEmails(): Promise<{ sent: number }> {
  const profilesSnap = await adminDb
    .collectionGroup('profile')
    .where('timezone', '!=', null)
    .get();

  let sent = 0;

  for (const profileDoc of profilesSnap.docs) {
    const profile = profileDoc.data();
    const userId: string   = profile.userId;
    const timezone: string = profile.timezone;
    const prefTime: string = profile.preferredNotificationTime;
    if (!userId || !timezone || !prefTime) continue;

    if (!isTimeMatching(prefTime, timezone, 30)) continue;

    const todayLocal = getDateInTimezone(timezone);

    // Documents expiring today
    const docsSnap = await adminDb
      .collection('users').doc(userId)
      .collection('documents')
      .where('expiryDate', '==', todayLocal)
      .get();

    if (docsSnap.empty) continue;

    for (const docDoc of docsSnap.docs) {
      const docName = docDoc.data().name as string;
      const notif   = getFunnyNotification('document_expiring');

      if (profile.pushNotificationsEnabled) {
        await sendOneSignalNotification({
          userId,
          title:   notif.title,
          message: `${docName} expires today!`,
          data: {
            entity_type: 'document_reminder',
            entity_id:   docDoc.id,
            document_id: docDoc.id,
          },
          buttons: getReminderButtons('document_reminder'),
        });
      }

      if (profile.emailNotificationsEnabled !== false && profile.email) {
        await sendEmail({
          to:      profile.email as string,
          subject: `📄 ${docName} expires TODAY!`,
          html: `
            <h2>${notif.title}</h2>
            <p><strong>${docName}</strong> expires today!</p>
            <p>${notif.message}</p>
            <p>— Remonk Reminder 🔔</p>
          `,
        });
        sent++;
      }
    }
  }

  return { sent };
}

// Scheduled version
export const sendReminderEmails = scheduler.onSchedule(
  { schedule: '0 * * * *', timeZone: 'UTC' },
  async () => {
    logger.info('[sendReminderEmails] Starting scheduled run');
    const { sent } = await runSendReminderEmails();
    logger.info(`[sendReminderEmails] Sent ${sent} emails`);
  }
);
