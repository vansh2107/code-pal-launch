/**
 * taskCarryForward — Scheduled Function
 *
 * Runs every hour. At each user's local midnight, moves all pending tasks
 * with task_date < today to today and increments consecutive_missed_days.
 *
 * Replaces: supabase/functions/task-carry-forward (pg_cron: 0 * * * *)
 *
 * Index strategy: query by status only (equality / 'in'), then filter
 * taskDate in memory. This avoids the composite-index requirement that
 * combines an 'in' filter with a '<' inequality, which caused
 * FAILED_PRECONDITION at runtime.
 */

import { scheduler } from 'firebase-functions/v2';
import { logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { getDateInTimezone } from '../shared/timezone';

export const taskCarryForward = scheduler.onSchedule(
  { schedule: '0 * * * *', timeZone: 'UTC' },
  async () => {
    logger.info('[taskCarryForward] Starting run');
    try {
      // Fetch all profiles without the collection-group inequality filter
      // ('timezone != null') that required an explicit index exemption.
      // Filter missing timezone in memory instead.
      const profilesSnap = await adminDb.collectionGroup('profile').get();

      let processed = 0;

      for (const profileDoc of profilesSnap.docs) {
        try {
          const profile = profileDoc.data();
          const userId: string  = profile.userId || profileDoc.ref.parent?.parent?.id || '';
          const timezone: string = profile.timezone;

          if (!userId || !timezone) continue;

          const todayLocal = getDateInTimezone(timezone);

          // Query by status only — no composite index required.
          const tasksSnap = await adminDb
            .collection('users').doc(userId)
            .collection('tasks')
            .where('status', 'in', ['pending', 'carried'])
            .get();

          const batch = adminDb.batch();
          const now = new Date().toISOString();
          let batchCount = 0;

          for (const taskDoc of tasksSnap.docs) {
            const task = taskDoc.data();
            // Filter taskDate < todayLocal in memory.
            if (task.taskDate && task.taskDate < todayLocal) {
              batch.update(taskDoc.ref, {
                taskDate:              todayLocal,
                localDate:             todayLocal,
                consecutiveMissedDays: (task.consecutiveMissedDays ?? 0) + 1,
                updatedAt:             now,
              });
              batchCount++;
              processed++;
            }
          }

          if (batchCount > 0) {
            await batch.commit();
          }
        } catch (userError) {
          logger.error(
            `[taskCarryForward] Error processing user profile ${profileDoc.ref.path}:`,
            userError,
          );
        }
      }

      logger.info(`[taskCarryForward] Carried forward ${processed} tasks`);
    } catch (error) {
      logger.error('[taskCarryForward] Fatal error:', error);
    }
  }
);
