/**
 * routineStepReminder — Scheduled Function
 *
 * Runs every 5 minutes. For each active routine, checks if any task slots
 * match the current local time (±5 min window). Deduplicates via
 * routine_notification_log. Cleans logs older than 2 days.
 *
 * Replaces: supabase/functions/routine-step-reminder (pg_cron: every-5-min)
 */

import { scheduler, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendOneSignalNotification } from '../shared/onesignal';
import { onesignalSecrets } from '../shared/secrets';
import { getFunnyNotification } from '../shared/funnyNotifications';
import { getReminderButtons } from '../shared/notificationActions';
import { getCurrentLocalTimeString, isTimeMatching } from '../shared/timezone';
import { FieldValue } from 'firebase-admin/firestore';

const WINDOW_MINUTES = 5;
const LOG_TTL_DAYS   = 2;

export const routineStepReminder = scheduler.onSchedule(
  { schedule: '*/5 * * * *', timeZone: 'UTC', secrets: onesignalSecrets },
  async () => {
    const profilesSnap = await adminDb
      .collectionGroup('profile')
      .where('pushNotificationsEnabled', '==', true)
      .where('timezone', '!=', null)
      .get();

    let sent = 0;

    // Cleanup stale log entries older than 2 days
    const cutoff = new Date(Date.now() - LOG_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const staleLogsSnap = await adminDb
      .collection('routine_notification_log')
      .where('sentAt', '<', cutoff)
      .limit(500)
      .get();
    const cleanupBatch = adminDb.batch();
    staleLogsSnap.forEach((d) => cleanupBatch.delete(d.ref));
    if (!staleLogsSnap.empty) await cleanupBatch.commit();

    for (const profileDoc of profilesSnap.docs) {
      const profile = profileDoc.data();
      const userId: string   = profile.userId;
      const timezone: string = profile.timezone;
      if (!userId || !timezone) continue;

      const currentTime = getCurrentLocalTimeString(timezone);

      const routinesSnap = await adminDb
        .collection('users').doc(userId)
        .collection('routines')
        .where('isActive', '==', true)
        .get();

      for (const routineDoc of routinesSnap.docs) {
        const routineId = routineDoc.id;

        const tasksSnap = await routineDoc.ref.collection('tasks').get();

        for (const taskDoc of tasksSnap.docs) {
          const slotsSnap = await taskDoc.ref.collection('slots').get();

          for (const slotDoc of slotsSnap.docs) {
            const slot = slotDoc.data();
            const slotTime: string  = slot.time ?? '07:00';
            const daysOfWeek: number[] = slot.daysOfWeek ?? [1,2,3,4,5,6,7];

            const dayOfWeek = new Date().getDay() || 7; // 1=Mon … 7=Sun
            if (!daysOfWeek.includes(dayOfWeek)) continue;

            if (!isTimeMatching(slotTime, timezone, WINDOW_MINUTES)) continue;

            const notifKey = `${routineId}_${slotDoc.id}_${currentTime}`;

            // Dedup check
            const existing = await adminDb
              .collection('routine_notification_log')
              .where('notificationKey', '==', notifKey)
              .limit(1)
              .get();

            if (!existing.empty) continue;

            const notif = getFunnyNotification('task_reminder');
            const taskName = (taskDoc.data().name as string) ?? 'Routine task';

            const ok = await sendOneSignalNotification({
              userId,
              title:   notif.title,
              message: `${taskName} — ${notif.message}`,
              data: {
                entity_type: 'routine_step',
                entity_id:   slotDoc.id,
                slot_id:     slotDoc.id,
                routine_id:  routineId,
              },
              buttons: getReminderButtons('routine_step'),
            });

            if (ok) {
              await adminDb.collection('routine_notification_log').add({
                notificationKey:  notifKey,
                userId,
                routineId,
                stepId:           slotDoc.id,
                notificationType: 'slot_start',
                sentAt:           FieldValue.serverTimestamp(),
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
