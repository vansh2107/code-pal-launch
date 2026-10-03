/**
 * routineStepReminder — Scheduled Function
 *
 * Runs every 5 minutes. For each active user, checks all active routines
 * and sends notifications for task slots that match the current local time
 * and day-of-week in the user's specific IANA timezone (country local time).
 *
 * Deduplicates via routine_notification_log per day and per slot time.
 * Cleans logs older than 2 days.
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { sendOneSignalNotification } from '../shared/onesignal';
import { onesignalSecrets } from '../shared/secrets';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getLocalDayInfo, isTimeMatching } from '../shared/timezone';

const WINDOW_MINUTES = 5;
const LOG_TTL_DAYS   = 2;

export const routineStepReminder = scheduler.onSchedule(
  { schedule: '*/5 * * * *', timeZone: 'UTC', secrets: onesignalSecrets },
  async () => {
    logger.info('[routineStepReminder] Starting run');

    // Fetch user profiles (matching pattern from taskTwoHourReminder)
    const profilesSnap = await adminDb
      .collectionGroup('profile')
      .get();

    let sent = 0;

    // Cleanup stale log entries older than 2 days
    const cutoff = Timestamp.fromMillis(Date.now() - LOG_TTL_DAYS * 24 * 60 * 60 * 1000);
    try {
      const staleLogsSnap = await adminDb
        .collection('routine_notification_log')
        .where('sentAt', '<', cutoff)
        .limit(500)
        .get();
      if (!staleLogsSnap.empty) {
        const cleanupBatch = adminDb.batch();
        staleLogsSnap.forEach((d) => cleanupBatch.delete(d.ref));
        await cleanupBatch.commit();
      }
    } catch (cleanupErr) {
      logger.warn('[routineStepReminder] Log cleanup warning:', cleanupErr);
    }

    for (const profileDoc of profilesSnap.docs) {
      const profile = profileDoc.data();
      const userId: string = profile.userId || profileDoc.ref.parent?.parent?.id || '';
      const timezone: string = profile.timezone || 'UTC';
      if (!userId || profile.pushNotificationsEnabled === false) continue;

      // Compute current local date and 1-indexed day of week in user's local timezone
      const { todayLocal, dayOfWeek } = getLocalDayInfo(timezone);

      const routinesSnap = await adminDb
        .collection('users').doc(userId)
        .collection('routines')
        .get();

      for (const routineDoc of routinesSnap.docs) {
        const routine = routineDoc.data();
        if (routine.isActive === false) continue;
        const routineId = routineDoc.id;
        const routineName = (routine.name as string) ?? 'Routine';

        const tasksSnap = await routineDoc.ref.collection('tasks').get();

        for (const taskDoc of tasksSnap.docs) {
          const taskData = taskDoc.data();
          const taskName = (taskData.name as string) ?? 'Routine step';
          const slotsSnap = await taskDoc.ref.collection('slots').get();

          for (const slotDoc of slotsSnap.docs) {
            const slot = slotDoc.data();
            const rawTime: string = slot.time ?? '07:00';
            const [h, m] = rawTime.split(':').map(Number);
            const slotTime = `${String(h || 0).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
            const daysOfWeek: number[] = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length > 0
              ? slot.daysOfWeek
              : [1, 2, 3, 4, 5, 6, 7];

            // Day of week check (1=Mon ... 7=Sun in local timezone)
            if (!daysOfWeek.includes(dayOfWeek)) continue;

            // Time match check within ±5 minutes of local time
            if (!isTimeMatching(slotTime, timezone, WINDOW_MINUTES)) continue;

            // Per-day, per-slot unique deduplication key
            const notifKey = `${todayLocal}_${routineId}_${slotDoc.id}_${slotTime}`;

            const existing = await adminDb
              .collection('routine_notification_log')
              .where('notificationKey', '==', notifKey)
              .limit(1)
              .get();

            if (!existing.empty) continue;

            const notif = getFunnyNotification('task_reminder');

            const ok = await sendOneSignalNotification({
              userId,
              title: `${routineName}: ${taskName}`,
              message: notif.message,
              data: {
                entity_type: 'routine_step',
                entity_id: slotDoc.id,
                slot_id: slotDoc.id,
                routine_id: routineId,
              },
              buttons: getReminderButtons('routine_step'),
            });

            if (ok) {
              await adminDb.collection('routine_notification_log').add({
                notificationKey: notifKey,
                userId,
                routineId,
                stepId: slotDoc.id,
                notificationType: 'slot_start',
                sentAt: FieldValue.serverTimestamp(),
              });
              sent++;
            }
          }
        }
      }
    }

    if (sent > 0) logger.info(`[routineStepReminder] Sent ${sent} notifications`);
  }
);
