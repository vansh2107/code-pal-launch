/**
 * taskTwoHourReminder — Scheduled Function
 *
 * Runs every 5 minutes. For each active pending task today, sends the first
 * notification at start_time, then every 2 hours after.
 *
 * Replaces: supabase/functions/task-two-hour-reminder (pg_cron: every-5-min)
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getDateInTimezone } from '../shared/timezone';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export const taskTwoHourReminder = scheduler.onSchedule(
  { schedule: '*/5 * * * *', timeZone: 'UTC' },
  async () => {
    logger.info('[taskTwoHourReminder] Starting run');

    const profilesSnap = await adminDb
      .collectionGroup('profile')
      .where('pushNotificationsEnabled', '==', true)
      .where('timezone', '!=', null)
      .get();

    const now = Date.now();
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
        .where('taskDate', '==', todayLocal)
        .where('status', '==', 'pending')
        .where('reminderActive', '==', true)
        .get();

      for (const taskDoc of tasksSnap.docs) {
        const task = taskDoc.data();
        const startMs = new Date(task.startTime).getTime();

        // Only notify if we are at or after start_time
        if (now < startMs) continue;

        // First notification (startNotified not set yet)
        const isFirst = !task.startNotified;
        const lastSentMs = task.lastReminderSentAt
          ? new Date(task.lastReminderSentAt).getTime()
          : 0;

        const shouldSend =
          isFirst || (lastSentMs > 0 && now - lastSentMs >= TWO_HOURS_MS);

        if (!shouldSend) continue;

        const notif = getFunnyNotification('task_reminder');
        const buttons = getReminderButtons('task');

        const ok = await sendOneSignalNotification({
          userId,
          title:   notif.title,
          message: `${task.title}: ${notif.message}`,
          data:    { entity_type: 'task', entity_id: taskDoc.id, task_id: taskDoc.id },
          buttons,
        });

        if (ok) {
          const nowIso = new Date().toISOString();
          await taskDoc.ref.update({
            lastReminderSentAt: nowIso,
            startNotified:      true,
          });
          sent++;
        }
      }
    }

    logger.info(`[taskTwoHourReminder] Sent ${sent} notifications`);
  }
);
