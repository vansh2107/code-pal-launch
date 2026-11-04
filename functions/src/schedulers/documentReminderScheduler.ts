/**
 * documentReminderScheduler — Scheduled Function
 *
 * Runs every minute. Minute-precision per-document reminder scheduler.
 * Matches getCurrentLocalTimeString() exactly to preferredNotificationTime.
 *
 * Delivery is per-channel: a reminder is only marked sent once every channel
 * the user wants (push / email) has succeeded; failed channels retry on a
 * later run. An atomic claim prevents overlapping runs from double-sending.
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
import { claimReminder, releaseReminderClaim, recordDeliveryResult } from '../shared/reminderClaim';

export const documentReminderScheduler = scheduler.onSchedule(
  { schedule: '* * * * *', timeZone: 'UTC', secrets: onesignalSecrets },
  async () => {
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

          if (claim.pending.push) {
            pushOk = await sendOneSignalNotification({
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

          if (claim.pending.email) {
            emailOk = await sendEmail({
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

          const allDone = await recordDeliveryResult(
            reminderDoc.ref,
            { wantPush, wantEmail },
            claim.pending,
            { pushOk, emailOk }
          );

          if (allDone) {
            sent++;
          } else if (!pushOk && !emailOk) {
            // Both attempted channels failed — release so the next run retries.
            await releaseReminderClaim(reminderDoc.ref);
            logger.warn(
              `[documentReminderScheduler] Delivery failed for reminder ${reminderDoc.id}; will retry`
            );
          }
        } catch (err: unknown) {
          await releaseReminderClaim(reminderDoc.ref);
          logger.error(
            `[documentReminderScheduler] Error processing reminder ${reminderDoc.id}:`,
            err
          );
        }
      }
    }

    if (sent > 0) logger.info(`[documentReminderScheduler] Sent ${sent} reminders`);
  }
);
