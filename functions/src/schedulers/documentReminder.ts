/**
 * documentReminder — Scheduled Function
 *
 * Runs every hour. Fetches unsent reminders due today, checks the user's
 * preferred_notification_time against their local hour, sends push + email.
 *
 * Replaces: supabase/functions/document-reminder (pg_cron: 0 * * * *)
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { sendEmail } from '../shared/sendgrid';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getDateInTimezone, isTimeMatching } from '../shared/timezone';

export const documentReminder = scheduler.onSchedule(
  { schedule: '0 * * * *', timeZone: 'UTC' },
  async () => {
    logger.info('[documentReminder] Starting run');

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
      if (!userId || !timezone) continue;

      // Only notify at preferred time (±30 min window)
      if (prefTime && !isTimeMatching(prefTime, timezone, 30)) continue;

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

        // Push
        if (profile.pushNotificationsEnabled) {
          await sendOneSignalNotification({
            userId,
            title:   notif.title,
            message: `${docName}: ${notif.message}`,
            data:    {
              entity_type:  'document_reminder',
              entity_id:    reminderDoc.id,
              document_id:  reminder.documentId,
              reminder_id:  reminderDoc.id,
            },
            buttons: getReminderButtons('document_reminder'),
          });
        }

        // Email
        if (profile.emailNotificationsEnabled !== false && profile.email) {
          await sendEmail({
            to:      profile.email as string,
            subject: `📄 Reminder: ${docName} expires ${expiryDate}`,
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

    logger.info(`[documentReminder] Processed ${sent} reminders`);
  }
);
