/**
 * documentReminder — Scheduled Function
 *
 * Runs every hour. Fetches unsent reminders due today, checks the user's
 * preferred_notification_time against their local hour, sends push + email.
 *
 * Delivery is per-channel: a reminder is only marked sent once every channel
 * the user wants (push / email) has succeeded; failed channels retry on a
 * later run. An atomic claim prevents overlapping runs from double-sending.
 *
 * Replaces: supabase/functions/document-reminder (pg_cron: 0 * * * *)
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { onesignalSecrets } from '../shared/secrets';
import { sendEmail } from '../shared/sendgrid';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getDateInTimezone, isTimeMatching } from '../shared/timezone';
import { claimReminder, releaseReminderClaim, recordDeliveryResult } from '../shared/reminderClaim';

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

      const wantPush  = !!profile.pushNotificationsEnabled;
      const wantEmail = profile.emailNotificationsEnabled !== false && !!profile.email;

      for (const reminderDoc of remindersSnap.docs) {
        try {
          const claim = await claimReminder(reminderDoc.ref, { wantPush, wantEmail });
          if (!claim.claimed) continue;

          const reminder = reminderDoc.data();

          const docSnap = await adminDb
            .collection('users').doc(userId)
            .collection('documents').doc(reminder.documentId).get();

          const docName = docSnap.exists ? (docSnap.data()!.name as string) : 'Your document';
          const expiryDate: string = docSnap.exists
            ? (docSnap.data()!.expiryDate as string ?? '')
            : '';

          const notif = getFunnyNotification('document_expiring');

          let pushOk = false;
          let emailOk = false;

          // Push — only when still pending, so a successful push is never resent
          if (claim.pending.push) {
            pushOk = await sendOneSignalNotification({
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

          // Email — only when still pending
          if (claim.pending.email) {
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
          }

          const allDone = await recordDeliveryResult(
            reminderDoc.ref,
            { wantPush, wantEmail },
            claim.pending,
            { pushOk, emailOk }
          );

          if (allDone) {
            sent++;
          } else if (!pushOk && !emailOk) {
            await releaseReminderClaim(reminderDoc.ref);
            logger.warn(
              `[documentReminder] Delivery failed for reminder ${reminderDoc.id}; will retry`
            );
          }
        } catch (err: unknown) {
          await releaseReminderClaim(reminderDoc.ref);
          logger.error(
            `[documentReminder] Error processing reminder ${reminderDoc.id}:`,
            err
          );
        }
      }
    }

    logger.info(`[documentReminder] Processed ${sent} reminders`);
  }
);
