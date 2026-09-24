/**
 * taskIncompleteReminder — Scheduled Function
 *
 * Runs every hour. At the user's preferred_notification_time sends a funny
 * nudge for overdue tasks (urgent if 3+ missed days).
 *
 * Replaces: supabase/functions/task-incomplete-reminder (pg_cron: 0 * * * *)
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { isTimeMatching, getDateInTimezone } from '../shared/timezone';

export const taskIncompleteReminder = scheduler.onSchedule(
  { schedule: '0 * * * *', timeZone: 'UTC' },
  async () => {
    logger.info('[taskIncompleteReminder] Starting run');

    const profilesSnap = await adminDb
      .collectionGroup('profile')
      .where('pushNotificationsEnabled', '==', true)
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

      const todayLocal = getDateInTimezone(timezone);

      const tasksSnap = await adminDb
        .collection('users').doc(userId)
        .collection('tasks')
        .where('taskDate', '<=', todayLocal)
        .where('status', '==', 'pending')
        .get();

      if (tasksSnap.empty) continue;

      const taskTitles = tasksSnap.docs.map((d) => d.data().title as string).slice(0, 3);
      const hasLazy = tasksSnap.docs.some((d) => (d.data().consecutiveMissedDays ?? 0) >= 3);

      const notifType = hasLazy ? 'task_lazy_3days' : 'task_incomplete';
      const notif = getFunnyNotification(notifType);

      const ok = await sendOneSignalNotification({
        userId,
        title:   notif.title,
        message: `${notif.message} Tasks: ${taskTitles.join(', ')}`,
        data:    { type: 'task_incomplete' },
        buttons: getReminderButtons('task'),
      });

      if (ok) sent++;
    }

    logger.info(`[taskIncompleteReminder] Sent ${sent} notifications`);
  }
);
