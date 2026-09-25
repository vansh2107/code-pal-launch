/**
 * timezoneNotificationScheduler — Scheduled Function
 *
 * Runs every hour. Sends a daily summary push + email at each user's
 * preferred_notification_time with upcoming expiring documents (30-day
 * window) and today's pending tasks.
 *
 * Replaces: supabase/functions/timezone-notification-scheduler (pg_cron: 0 * * * *)
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { onesignalSecrets } from '../shared/secrets';
import { sendEmail } from '../shared/sendgrid';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getDateInTimezone, isTimeMatching } from '../shared/timezone';
import { addMinutesToDate } from '../shared/timezone';

export const timezoneNotificationScheduler = scheduler.onSchedule(
  { schedule: '0 * * * *', timeZone: 'UTC', secrets: onesignalSecrets },
  async () => {
    logger.info('[timezoneNotificationScheduler] Starting run');

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

      if (!isTimeMatching(prefTime, timezone, 30)) continue;

      const todayLocal   = getDateInTimezone(timezone);
      const in30Days     = addMinutesToDate(new Date(), 30 * 24 * 60).toISOString().slice(0, 10);

      // Expiring documents in next 30 days
      const docsSnap = await adminDb
        .collection('users').doc(userId)
        .collection('documents')
        .where('expiryDate', '>=', todayLocal)
        .where('expiryDate', '<=', in30Days)
        .get();

      // Today's tasks
      const tasksSnap = await adminDb
        .collection('users').doc(userId)
        .collection('tasks')
        .where('taskDate', '==', todayLocal)
        .where('status', '==', 'pending')
        .get();

      if (docsSnap.empty && tasksSnap.empty) continue;

      const docNames  = docsSnap.docs.map((d) => d.data().name as string).slice(0, 3);
      const taskTitles = tasksSnap.docs.map((d) => d.data().title as string).slice(0, 3);

      const notif = getFunnyNotification('daily_summary');
      let message = notif.message;
      if (docNames.length > 0)   message += ` Expiring: ${docNames.join(', ')}.`;
      if (taskTitles.length > 0) message += ` Tasks: ${taskTitles.join(', ')}.`;

      if (profile.pushNotificationsEnabled) {
        await sendOneSignalNotification({
          userId,
          title:   notif.title,
          message,
          data:    { type: 'daily_summary' },
        });
      }

      if (profile.emailNotificationsEnabled !== false && profile.email) {
        const docsHtml = docNames.length > 0
          ? `<p><strong>Expiring soon:</strong> ${docNames.join(', ')}</p>`
          : '';
        const tasksHtml = taskTitles.length > 0
          ? `<p><strong>Today's tasks:</strong> ${taskTitles.join(', ')}</p>`
          : '';

        await sendEmail({
          to:      profile.email as string,
          subject: `${notif.title} — Your daily Remonk summary`,
          html: `
            <h2>${notif.title}</h2>
            <p>${notif.message}</p>
            ${docsHtml}
            ${tasksHtml}
            <p>— Remonk Reminder 🔔</p>
          `,
        });
      }

      sent++;
    }

    logger.info(`[timezoneNotificationScheduler] Notified ${sent} users`);
  }
);
