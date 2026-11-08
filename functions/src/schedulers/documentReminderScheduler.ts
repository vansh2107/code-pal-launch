/**
 * documentReminderScheduler — Scheduled Function
 *
 * Runs every minute. Minute-precision per-document reminder scheduler.
 * Matches getCurrentLocalTimeString() against preferredNotificationTime.
 *
 * Handles both automatic reminders (auto-created before expiry) and custom reminders
 * (isCustom: true).
 *
 * Primary channel: OneSignal push notification (both mobile and web).
 * Email channel: SendGrid (best-effort; works when configured, but email failure
 * never blocks push delivery or exhausts attempts).
 *
 * Query resilience:
 * - Simple single-field query `.where('isSent', '==', false)` eliminates any composite
 *   index requirements or FAILED_PRECONDITION index errors.
 * - In-memory date filtering enforces the window: reminderDate <= todayLocal and >= minDateBound (last 7 days).
 * - Per-user try/catch ensures an isolated issue with one user never crashes the scheduler
 *   for other users.
 * - Extracts userId with fallback to profileDoc.ref.parent?.parent?.id.
 * - Defaults: timezone defaults to 'UTC', pushNotificationsEnabled !== false (default enabled).
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { notificationSecrets } from '../shared/secrets';
import { sendEmail, isSendGridConfigured } from '../shared/sendgrid';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getDateInTimezone, getCurrentLocalTimeString, addMinutesToDate } from '../shared/timezone';
import { claimReminder, releaseReminderClaim, recordDeliveryResult } from '../shared/reminderClaim';

export const documentReminderScheduler = scheduler.onSchedule(
  { schedule: '* * * * *', timeZone: 'UTC', secrets: notificationSecrets },
  async () => {
    let profilesSnap;
    try {
      profilesSnap = await adminDb
        .collectionGroup('profile')
        .get();
    } catch (err: unknown) {
      logger.error('[documentReminderScheduler] Failed to fetch profiles:', err);
      return;
    }

    let sent = 0;

    for (const profileDoc of profilesSnap.docs) {
      try {
        const profile = profileDoc.data();
        const userId: string   = profile.userId || profileDoc.ref.parent?.parent?.id || '';
        const timezone: string = profile.timezone || 'UTC';

        if (!userId) continue;

        // Normalise "HH:mm:ss" / "H:mm" → "HH:mm"; default to 09:00 when unset.
        const rawPref = String(profile.preferredNotificationTime || '09:00');
        const [ph = '9', pm = '0'] = rawPref.split(':');
        const prefTime = `${ph.padStart(2, '0')}:${pm.padStart(2, '0')}`;

        // Fire at or after the preferred time (catch-up if a minute was missed);
        // atomic claims + isSent prevent duplicates.
        const currentTime = getCurrentLocalTimeString(timezone).slice(0, 5);
        if (currentTime < prefTime) continue;

        const todayLocal = getDateInTimezone(timezone);
        // Look back up to 7 days for any missed/overdue reminders
        const minDateBound = addMinutesToDate(new Date(), -7 * 24 * 60).toISOString().slice(0, 10);

        // Simple single-field query: never requires a composite index
        const remindersSnap = await adminDb
          .collection('users').doc(userId)
          .collection('reminders')
          .where('isSent', '==', false)
          .get();

        if (remindersSnap.empty) continue;

        // Filter dates safely in memory
        const dueDocs = remindersSnap.docs.filter((doc) => {
          const d = doc.data()?.reminderDate;
          return typeof d === 'string' && d <= todayLocal && d >= minDateBound;
        });

        if (dueDocs.length === 0) continue;

        const wantPush  = profile.pushNotificationsEnabled !== false;
        const wantEmail = profile.emailNotificationsEnabled !== false && !!profile.email && isSendGridConfigured();

        for (const reminderDoc of dueDocs) {
          try {
            const claim = await claimReminder(reminderDoc.ref, { wantPush, wantEmail });
            if (!claim.claimed) continue;

            const reminder = reminderDoc.data();
            const isCustom = reminder.isCustom === true;

            const docSnap = await adminDb
              .collection('users').doc(userId)
              .collection('documents').doc(reminder.documentId).get();

            const docName = docSnap.exists ? (docSnap.data()!.name as string) : 'Your document';
            const expiryDate: string = docSnap.exists
              ? (docSnap.data()!.expiryDate as string ?? '')
              : '';

            const notif = getFunnyNotification('document_expiring');
            const message = isCustom
              ? (expiryDate ? `Reminder: ${docName} (expires ${expiryDate})` : `Reminder: ${docName}`)
              : (expiryDate ? `${docName} expires ${expiryDate}` : `${docName} reminder`);

            let pushOk = false;
            let emailOk = false;

            if (claim.pending.push) {
              pushOk = await sendOneSignalNotification({
                userId,
                title:   notif.title,
                message,
                data: {
                  entity_type: 'document_reminder',
                  entity_id:   reminderDoc.id,
                  document_id: reminder.documentId,
                  reminder_id: reminderDoc.id,
                  is_custom:   isCustom ? 'true' : 'false',
                },
                buttons: getReminderButtons('document_reminder'),
              });
            }

            if (claim.pending.email) {
              emailOk = await sendEmail({
                to:      profile.email as string,
                subject: `📄 ${message}`,
                html: `
                  <h2>${notif.title}</h2>
                  <p><strong>${docName}</strong>${expiryDate ? ` expires on ${expiryDate}.` : '.'}</p>
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
            } else if (!pushOk && (!claim.pending.email || !emailOk)) {
              // Push failed — release so the next run retries.
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
      } catch (userErr: unknown) {
        logger.error(
          `[documentReminderScheduler] Error processing user in profile doc ${profileDoc.id}:`,
          userErr
        );
      }
    }

    if (sent > 0) logger.info(`[documentReminderScheduler] Sent ${sent} reminders`);
  }
);
