/**
 * documentReminderScheduler — Scheduled Function
 *
 * Runs every minute. Minute-precision per-document reminder scheduler.
 * Matches getCurrentLocalTimeString() exactly to preferredNotificationTime.
 *
 * Replaces: supabase/functions/document-reminder-scheduler (pg_cron: * * * * *)
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { onesignalSecrets } from '../shared/secrets';
import { sendEmail } from '../shared/sendgrid';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getDateInTimezone, getCurrentLocalTimeString } from '../shared/timezone';

export const documentReminderScheduler = scheduler.onSchedule(
  { schedule: '* * * * *', timeZone: 'UTC', secrets: onesignalSecrets },
  async () => {
    const profilesSnap = await adminDb
      .collectionGroup('profile')
      .where('preferredNotificationTime', '!=', null)
      .where('timezone', '!=', null)
      .get();

    let sent = 0;

    for (const profileDoc of profilesSnap.docs) {
      const profile = profileDoc.data();
      const userId: string   = profile.userId;
      const timezone: string = profile.timezone;
      const prefTime: string = profile.preferredNotificationTime;
      if (!userId || !timezone || !prefTime) continue;

      // Exact minute match
      const currentTime = getCurrentLocalTimeString(timezone);
      if (currentTime !== prefTime) continue;

      const todayLocal = getDateInTimezone(timezone);

      const remindersSnap = await adminDb
        .collection('users').doc(userId)
        .collection('reminders')
        .where('reminderDate', '==', todayLocal)
        .where('isSent', '==', false)
        .get();

      if (remindersSnap.empty) continue;

      for (const reminderDoc of remindersSnap.docs) {
        const reminder = reminderDoc.data();

        const docSnap = await adminDb
          .collection('users').doc(userId)
          .collection('documents').doc(reminder.documentId).get();

        const docName = docSnap.exists ? (docSnap.data()!.name as string) : 'Your document';
        const expiryDate: string = docSnap.exists
          ? (docSnap.data()!.expiryDate as string ?? '')
          : '';

        const notif = getFunnyNotification('document_expiring');

        if (profile.pushNotificationsEnabled) {
          await sendOneSignalNotification({
            userId,
            title:   notif.title,
            message: `${docName} expires ${expiryDate}`,
            data: {
              entity_type: 'document_reminder',
              entity_id:   reminderDoc.id,
              document_id: reminder.documentId,
              reminder_id: reminderDoc.id,
            },
            buttons: getReminderButtons('document_reminder'),
          });
        }

        if (profile.emailNotificationsEnabled !== false && profile.email) {
          await sendEmail({
            to:      profile.email as string,
            subject: `📄 ${docName} expires ${expiryDate}`,
            html: `
              <h2>${notif.title}</h2>
              <p><strong>${docName}</strong> expires on ${expiryDate}.</p>
              <p>${notif.message}</p>
              <p>— Remonk Reminder 🔔</p>
            `,
          });
        }

        await reminderDoc.ref.update({ isSent: true });
        sent++;
      }
    }

    if (sent > 0) logger.info(`[documentReminderScheduler] Sent ${sent} reminders`);
  }
);
