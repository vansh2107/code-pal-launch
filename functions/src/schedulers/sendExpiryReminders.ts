/**
 * sendExpiryReminders — Scheduled Function
 *
 * Runs every hour. Fetches all reminders due today (plus a bounded
 * catch-up window for overdue ones) that haven't been sent.
 * Checks user's local time against preferred_notification_time.
 * Sends SendGrid email + OneSignal push if enabled. Marks reminders sent
 * only after the provider accepts delivery; failed sends stay eligible
 * for a bounded retry.
 *
 * Replaces: supabase/functions/send-expiry-reminders
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

export const sendExpiryReminders = scheduler.onSchedule(
  { schedule: '0 * * * *', timeZone: 'UTC', secrets: onesignalSecrets },
  async () => {
    logger.info('[sendExpiryReminders] Starting run');

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
        // Atomic claim prevents duplicates from overlapping/retried runs.
        const claimed = await claimReminderForSend(reminderDoc.ref);
        if (!claimed) continue;

        const reminder = reminderDoc.data();

        const docSnap = await adminDb
          .collection('users').doc(userId)
          .collection('documents').doc(reminder.documentId).get();

        const docName    = docSnap.exists ? (docSnap.data()!.name as string)       : 'Your document';
        const expiryDate = docSnap.exists ? (docSnap.data()!.expiryDate as string ?? '') : '';

        const notif = getFunnyNotification('document_expiring');

        const wantPush = !!profile.pushNotificationsEnabled;
        const wantEmail = profile.emailNotificationsEnabled !== false && !!profile.email;

        let pushOk = true;
        if (wantPush) {
          const result = await sendOneSignalNotificationDetailed({
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
          pushOk = result.success;
          if (!result.success) {
            logger.warn(
              `[sendExpiryReminders] Push not accepted for reminder ${reminderDoc.id} (user ${userId}): ${result.reason} — ${result.detail}`
            );
          }
        }

        let emailOk = true;
        if (wantEmail) {
          emailOk = await sendEmail({
            to:      profile.email as string,
            subject: `📄 Expiry reminder: ${docName}`,
            html: `
              <h2>${notif.title}</h2>
              <p><strong>${docName}</strong> expires on ${expiryDate}.</p>
              <p>${notif.message}</p>
              <p>— Remonk Reminder 🔔</p>
            `,
          });
          if (!emailOk) {
            logger.warn(`[sendExpiryReminders] Email failed for reminder ${reminderDoc.id} (user ${userId})`);
          }
        }

        // Mark sent only if at least one requested channel was accepted; otherwise release for retry.
        if (pushOk || emailOk || (!wantPush && !wantEmail)) {
          await markReminderSent(reminderDoc.ref);
          sent++;
        } else {
          await releaseReminderClaim(reminderDoc.ref);
          logger.warn(`[sendExpiryReminders] Delivery failed for reminder ${reminderDoc.id}; will retry`);
        }
      }
    }

    logger.info(`[sendExpiryReminders] Processed ${sent} reminders`);
  }
);
