/**
 * taskOverdueAlert — Scheduled Function
 *
 * Runs every hour. Sends one overdue alert per task per day for tasks with
 * 3+ consecutive missed days. Deduplicates via lastOverdueAlertSent.
 *
 * Replaces: supabase/functions/task-overdue-alert
 *
 * Index strategy: query by status == 'pending' only (equality), then filter
 * consecutiveMissedDays >= 3 in memory. This avoids the composite-index
 * requirement that combines equality with a range inequality, which caused
 * FAILED_PRECONDITION at runtime.
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { onesignalSecrets } from '../shared/secrets';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getDateInTimezone } from '../shared/timezone';

export const taskOverdueAlert = scheduler.onSchedule(
  { schedule: '0 * * * *', timeZone: 'UTC', secrets: onesignalSecrets },
  async () => {
    logger.info('[taskOverdueAlert] Starting run');
    try {
      const profilesSnap = await adminDb.collectionGroup('profile').get();
      let sent = 0;

      for (const profileDoc of profilesSnap.docs) {
        try {
          const profile = profileDoc.data();
          const userId: string  = profile.userId || profileDoc.ref.parent?.parent?.id || '';
          const timezone: string = profile.timezone || 'UTC';
          if (!userId || profile.pushNotificationsEnabled === false) continue;

          const todayLocal = getDateInTimezone(timezone);

          // Query by equality only — no composite index required.
          const tasksSnap = await adminDb
            .collection('users').doc(userId)
            .collection('tasks')
            .where('status', '==', 'pending')
            .get();

          for (const taskDoc of tasksSnap.docs) {
            const task = taskDoc.data();
            // Filter consecutiveMissedDays >= 3 in memory.
            if ((task.consecutiveMissedDays ?? 0) < 3) continue;
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
        } catch (userError) {
          logger.error(
            `[taskOverdueAlert] Error processing user profile ${profileDoc.ref.path}:`,
            userError,
          );
        }
      }

      logger.info(`[taskOverdueAlert] Sent ${sent} alerts`);
    } catch (error) {
      logger.error('[taskOverdueAlert] Fatal error:', error);
    }
  }
);
