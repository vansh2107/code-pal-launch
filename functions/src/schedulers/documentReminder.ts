/**
 * documentReminder — Scheduled Function
 *
 * Runs every hour. Fetches unsent reminders due today (plus a bounded
 * catch-up window for overdue ones), checks the user's
 * preferred_notification_time against their local hour, sends push + email.
 *
 * A reminder is only marked isSent=true after the provider confirms
 * acceptance; failed deliveries are released for a bounded retry.
 *
 * Replaces: supabase/functions/document-reminder (pg_cron: 0 * * * *)
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotificationDetailed } from '../shared/onesignal';
import { onesignalSecrets } from '../shared/secrets';
import { sendEmail } from '../shared/sendgrid';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getDateInTimezone, getLocalDateDaysAgo, isTimeMatching } from '../shared/timezone';
import {
  claimReminderForSend,
  releaseReminderClaim,
  markReminderSent,
} from '../shared/reminderClaim';

export const documentReminder = scheduler.onSchedule(
  { schedule: '0 * * * *', timeZone: 'UTC', secrets: onesignalSecrets },
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

      // Only notify at preferred time (±30 min window).
      // isTimeMatching splits on ":" so both "HH:mm" and "HH:mm:ss" work.
      if (prefTime && !isTimeMatching(prefTime, timezone, 30)) continue;

      const todayLocal = getDateInTimezone(timezone);
      const catchupFrom = getLocalDateDaysAgo(timezone, 2);

      // Bounded catch-up: today plus the last 2 local days.
      const remindersSnap = await adminDb
        .collection('users').doc(userId)
        .collection('reminders')
        .where('reminderDate', '>=', catchupFrom)
        .where('reminderDate', '<=', todayLocal)
        .where('isSent', '==', false)
        .get();

      if (remindersSnap.empty) continue;

      for (const reminderDoc of remindersSnap.docs) {
        // Atomic claim prevents duplicate sends across overlapping runs.
        const claimed = await claimReminderForSend(reminderDoc.ref);
        if (!claimed) continue;

        const reminder = reminderDoc.data();

        const docSnap = await adminDb
          .collection('users').doc(userId)
          .collection('documents').doc(reminder.documentId).get();

        const docName = docSnap.exists ? (docSnap.data()!.name as string) : 'Your document';
        const expiryDate: string = docSnap.exists
          ? (docSnap.data()!.expiryDate as string ?? '')
          : '';

        const notif = getFunnyNotification('document_expiring');

        const wantPush  = !!profile.pushNotificationsEnabled;
        const wantEmail = profile.emailNotificationsEnabled !== false && !!profile.email;

        let pushOk = true;
        if (wantPush) {
          const result = await sendOneSignalNotificationDetailed({
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
          pushOk = result.success;
          if (!result.success) {
            logger.warn(
              `[documentReminder] Push not accepted for reminder ${reminderDoc.id} (user ${userId}): ${result.reason} — ${result.detail}`
            );
          }
        }

        let emailOk = true;
        if (wantEmail) {
          emailOk = await sendEmail({
            to:      profile.email as string,
            subject: `📄 Reminder: ${docName} expires ${expiryDate}`,
            html: `
              <h2>${notif.title}</h2>
              <p><strong>${docName}</strong> expires on ${expiryDate}.</p>
              <p>${notif.message}</p>
              <p>— Remonk Reminder 🔔</p>
            `,
          });
          if (!emailOk) {
            logger.warn(`[documentReminder] Email failed for reminder ${reminderDoc.id} (user ${userId})`);
          }
        }

        // Mark sent only when a requested channel was actually accepted.
        if (pushOk || emailOk || (!wantPush && !wantEmail)) {
          await markReminderSent(reminderDoc.ref);
          sent++;
        } else {
          await releaseReminderClaim(reminderDoc.ref);
          logger.warn(`[documentReminder] Delivery failed for reminder ${reminderDoc.id}; left for retry`);
        }
      }
    }

    logger.info(`[documentReminder] Processed ${sent} reminders`);
  }
);
