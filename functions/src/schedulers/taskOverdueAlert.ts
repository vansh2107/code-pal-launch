/**
 * taskOverdueAlert — Scheduled Function
 *
 * Runs every hour. Sends one overdue alert per task per day for tasks with
 * 3+ consecutive missed days. Deduplicates via lastOverdueAlertSent.
 *
 * Replaces: supabase/functions/task-overdue-alert
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getDateInTimezone } from '../shared/timezone';

export const taskOverdueAlert = scheduler.onSchedule(
  { schedule: '0 * * * *', timeZone: 'UTC' },
  async () => {
    logger.info('[taskOverdueAlert] Starting run');

    const profilesSnap = await adminDb
      .collectionGroup('profile')
      .where('pushNotificationsEnabled', '==', true)
      .where('timezone', '!=', null)
      .get();

    let sent = 0;

    for (const profileDoc of profilesSnap.docs) {
      const profile = profileDoc.data();
      const userId: string   = profile.userId;
      const timezone: string = profile.timezone;
      if (!userId || !timezone) continue;

      const todayLocal = getDateInTimezone(timezone);

      const tasksSnap = await adminDb
        .collection('users').doc(userId)
        .collection('tasks')
        .where('consecutiveMissedDays', '>=', 3)
        .where('status', '==', 'pending')
        .get();

      for (const taskDoc of tasksSnap.docs) {
        const task = taskDoc.data();
        // Already alerted today?
        if (task.lastOverdueAlertSent === todayLocal) continue;

        const notif = getFunnyNotification('task_lazy_3days');
        const ok = await sendOneSignalNotification({
          userId,
          title:   notif.title,
          message: `${task.title}: ${notif.message}`,
          data:    { entity_type: 'task', entity_id: taskDoc.id, task_id: taskDoc.id },
          buttons: getReminderButtons('task'),
        });

        if (ok) {
          await taskDoc.ref.update({ lastOverdueAlertSent: todayLocal });
          sent++;
        }
      }
    }

    logger.info(`[taskOverdueAlert] Sent ${sent} alerts`);
  }
);
