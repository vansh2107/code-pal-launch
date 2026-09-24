/**
 * sendBulkNotification — Scheduled Function
 *
 * Sends a periodic bulk email to all users with email notifications enabled.
 * Uses Firebase Admin auth.listUsers() to enumerate addresses.
 *
 * Replaces: supabase/functions/send-bulk-notification
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminAuth } from '../shared/admin';
import { sendEmail } from '../shared/sendgrid';
import { getFunnyNotification } from '../shared/funnyNotifications';

export const sendBulkNotification = scheduler.onSchedule(
  // Weekly on Monday at 09:00 UTC — adjust as needed
  { schedule: '0 9 * * 1', timeZone: 'UTC' },
  async () => {
    logger.info('[sendBulkNotification] Starting run');

    const notif = getFunnyNotification('daily_summary');
    let sent = 0;
    let nextPageToken: string | undefined;

    do {
      const listResult = await adminAuth.listUsers(1000, nextPageToken);

      for (const user of listResult.users) {
        if (!user.email) continue;
        if (user.disabled)  continue;

        const ok = await sendEmail({
          to:      user.email,
          subject: `${notif.title} — Weekly from Remonk Reminder`,
          html: `
            <h2>${notif.title}</h2>
            <p>${notif.message}</p>
            <p>Your documents are safely stored and we're watching their expiry dates for you!</p>
            <p>— Remonk Reminder 🔔</p>
          `,
        });

        if (ok) sent++;
      }

      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    logger.info(`[sendBulkNotification] Sent ${sent} emails`);
  }
);
