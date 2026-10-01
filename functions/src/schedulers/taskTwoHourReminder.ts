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
import { onesignalSecrets } from '../shared/secrets';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const CLAIM_TTL_MS = 4 * 60 * 1000;

export const taskTwoHourReminder = scheduler.onSchedule(
  { schedule: '*/5 * * * *', timeZone: 'UTC', secrets: onesignalSecrets },
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

      // Eligibility is based on UTC instants, not the local calendar date, so
      // overdue / carried-forward / midnight-crossing tasks are not dropped.
      const tasksSnap = await adminDb
        .collection('users').doc(userId)
        .collection('tasks')
        .where('status', '==', 'pending')
        .where('reminderActive', '==', true)
        .get();

      for (const taskDoc of tasksSnap.docs) {
        const task = taskDoc.data();
        const startMs = Date.parse(task.startTime);
        if (!Number.isFinite(startMs)) continue;     // invalid/missing timestamp
        if (now < startMs) continue;                 // future task: never early

        const lastSentMs = task.lastReminderSentAt ? Date.parse(task.lastReminderSentAt) : NaN;
        const due = !task.startNotified || !Number.isFinite(lastSentMs) || now - lastSentMs >= TWO_HOURS_MS;
        if (!due) continue;

        // Claim atomically so overlapping/retried runs can't double-send.
        const claimed = await adminDb.runTransaction(async (tx) => {
          const fresh = await tx.get(taskDoc.ref);
          const d = fresh.data();
          if (!d || d.status !== 'pending' || d.reminderActive !== true) return false;
          const claimMs = d.reminderClaimAt ? Date.parse(d.reminderClaimAt) : NaN;
          if (Number.isFinite(claimMs) && now - claimMs < CLAIM_TTL_MS) return false;
          const last = d.lastReminderSentAt ? Date.parse(d.lastReminderSentAt) : NaN;
          if (d.startNotified && Number.isFinite(last) && now - last < TWO_HOURS_MS) return false;
          tx.update(taskDoc.ref, { reminderClaimAt: new Date(now).toISOString() });
          return true;
        });
        if (!claimed) continue;

        const notif = getFunnyNotification('task_reminder');
        const ok = await sendOneSignalNotification({
          userId,
          title:   notif.title,
          message: `${task.title}: ${notif.message}`,
          data:    { entity_type: 'task', entity_id: taskDoc.id, task_id: taskDoc.id },
          buttons: getReminderButtons('task'),
        });

        // Only record as sent when OneSignal accepted it; release claim on failure so it retries.
        await taskDoc.ref.update(ok
          ? { lastReminderSentAt: new Date().toISOString(), startNotified: true, reminderClaimAt: null }
          : { reminderClaimAt: null });
        if (ok) sent++;
        else logger.warn(`[taskTwoHourReminder] Delivery failed for task ${taskDoc.id}; will retry`);
      }
    }

    logger.info(`[taskTwoHourReminder] Sent ${sent} notifications`);
  }
);
