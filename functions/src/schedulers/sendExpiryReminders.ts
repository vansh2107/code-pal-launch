/**
 * sendExpiryReminders — Scheduled Function
 *
 * Runs every hour. Fetches all reminders due today that haven't been sent.
 * Checks user's local time against preferred_notification_time.
 * Sends SendGrid email + OneSignal push if enabled. Marks reminders sent.
 *
 * Replaces: supabase/functions/send-expiry-reminders
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { onesignalSecrets } from '../shared/secrets';
import { sendEmail } from '../shared/sendgrid';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getDateInTimezone, isTimeMatching } from '../shared/timezone';

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

      const remindersSnap = await adminDb
        .collection('users').doc(userId)
        .collection('reminders')
        .where('reminderDate', '==', todayLocal)
        .where('isSent', '==', false)
        .get();

      if (remindersSnap.empty) continue;

      for (const reminderDoc of remindersSnap.docs) {
        const reminder = reminderDoc.data();

        // Atomic claim prevents duplicates from overlapping/retried runs.
        const nowMs = Date.now();
        const claimed = await adminDb.runTransaction(async (tx) => {
          const fresh = (await tx.get(reminderDoc.ref)).data();
          if (!fresh || fresh.isSent) return false;
          const c = fresh.sendClaimAt ? Date.parse(fresh.sendClaimAt) : NaN;
          if (Number.isFinite(c) && nowMs - c < 10 * 60 * 1000) return false;
          tx.update(reminderDoc.ref, { sendClaimAt: new Date(nowMs).toISOString() });
          return true;
        });
        if (!claimed) continue;

        const docSnap = await adminDb
          .collection('users').doc(userId)
          .collection('documents').doc(reminder.documentId).get();

        const docName    = docSnap.exists ? (docSnap.data()!.name as string)       : 'Your document';
        const expiryDate = docSnap.exists ? (docSnap.data()!.expiryDate as string ?? '') : '';

        const notif = getFunnyNotification('document_expiring');

        let pushOk = false;
        let emailOk = false;
        const wantPush = !!profile.pushNotificationsEnabled;
        const wantEmail = profile.emailNotificationsEnabled !== false && !!profile.email;

        if (wantPush) {
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
        }

        // Mark sent only if at least one requested channel was accepted; otherwise release for retry.
        if (pushOk || emailOk || (!wantPush && !wantEmail)) {
          await reminderDoc.ref.update({ isSent: true, sendClaimAt: null, sentAt: new Date().toISOString() });
          sent++;
        } else {
          await reminderDoc.ref.update({ sendClaimAt: null });
          logger.warn(`[sendExpiryReminders] Delivery failed for reminder ${reminderDoc.id}; will retry`);
        }
      }
    }

    logger.info(`[sendExpiryReminders] Processed ${sent} reminders`);
  }
);
