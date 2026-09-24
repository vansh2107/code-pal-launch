/**
 * taskCarryForward — Scheduled Function
 *
 * Runs every hour. At each user's local midnight, moves all pending tasks
 * with task_date < today to today and increments consecutive_missed_days.
 *
 * Replaces: supabase/functions/task-carry-forward (pg_cron: 0 * * * *)
 */

import { scheduler } from 'firebase-functions/v2';
import { logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { getDateInTimezone } from '../shared/timezone';

export const taskCarryForward = scheduler.onSchedule(
  { schedule: '0 * * * *', timeZone: 'UTC' },
  async () => {
    logger.info('[taskCarryForward] Starting run');

    // Fetch all profiles that have a timezone set
    const profilesSnap = await adminDb
      .collectionGroup('profile')
      .where('timezone', '!=', null)
      .get();

    let processed = 0;

    for (const profileDoc of profilesSnap.docs) {
      const profile = profileDoc.data();
      const userId: string  = profile.userId;
      const timezone: string = profile.timezone;

      if (!userId || !timezone) continue;

      const todayLocal = getDateInTimezone(timezone);

      // Fetch pending/carried tasks with task_date before today
      const tasksSnap = await adminDb
        .collection('users').doc(userId)
        .collection('tasks')
        .where('status', 'in', ['pending', 'carried'])
        .where('taskDate', '<', todayLocal)
        .get();

      const batch = adminDb.batch();
      const now = new Date().toISOString();

      for (const taskDoc of tasksSnap.docs) {
        const task = taskDoc.data();
        batch.update(taskDoc.ref, {
          taskDate:              todayLocal,
          localDate:             todayLocal,
          consecutiveMissedDays: (task.consecutiveMissedDays ?? 0) + 1,
          updatedAt:             now,
        });
        processed++;
      }

      if (tasksSnap.size > 0) {
        await batch.commit();
      }
    }

    logger.info(`[taskCarryForward] Carried forward ${processed} tasks`);
  }
);
