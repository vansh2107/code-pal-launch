/**
 * documentReminderScheduler — Scheduled Function
 *
 * Runs every minute. Minute-precision per-document reminder scheduler.
 * Matches getCurrentLocalTimeString() (normalised "HH:mm") against the
 * user's preferredNotificationTime — which may be stored as "HH:mm" or
 * "HH:mm:ss" (both are normalised before comparison).
 *
 * Also performs bounded catch-up: overdue, unsent reminders from the last
 * 2 local days are sent at the user's preferred time instead of being
 * silently skipped. Delivery state is only flipped after the provider
 * accepts the notification.
 *
 * Replaces: supabase/functions/document-reminder-scheduler (pg_cron: * * * * *)
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotificationDetailed } from '../shared/onesignal';
import { onesignalSecrets } from '../shared/secrets';
import { sendEmail } from '../shared/sendgrid';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import {
  getDateInTimezone,
  getCurrentLocalTimeString,
  getLocalDateDaysAgo,
  normalizePreferredTime,
} from '../shared/timezone';
import {
  claimReminderForSend,
  releaseReminderClaim,
  markReminderSent,
} from '../shared/reminderClaim';

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

      // Exact minute match — normalise "HH:mm" / "HH:mm:ss" first.
      const currentTime = getCurrentLocalTimeString(timezone);
      if (currentTime !== normalizePreferredTime(prefTime)) continue;

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
              `[documentReminderScheduler] Push not accepted for reminder ${reminderDoc.id} (user ${userId}): ${result.reason} — ${result.detail}`
            );
          }
        }

        let emailOk = true;
        if (wantEmail) {
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
          if (!emailOk) {
            logger.warn(`[documentReminderScheduler] Email failed for reminder ${reminderDoc.id} (user ${userId})`);
          }
        }

        // Mark sent only when a requested channel was actually accepted;
        // otherwise release the claim (attempts counter incremented) for retry.
        if (pushOk || emailOk || (!wantPush && !wantEmail)) {
          await markReminderSent(reminderDoc.ref);
          sent++;
        } else {
          await releaseReminderClaim(reminderDoc.ref);
          logger.warn(`[documentReminderScheduler] Delivery failed for reminder ${reminderDoc.id}; left for retry`);
        }
      }
    }

    if (sent > 0) logger.info(`[documentReminderScheduler] Sent ${sent} reminders`);
  }
);
