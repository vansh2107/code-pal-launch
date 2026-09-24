/**
 * notificationAction — HTTPS Callable
 *
 * Handles Done / Snooze / More button actions from push notifications.
 * Replaces: supabase/functions/notification-action
 *
 * Supported entity types: task | document_reminder | routine_step
 * Actions: complete | snooze (with snooze: minutes | 'tonight' | 'tomorrow')
 */

import { https, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { profilePath } from '../shared/database';
import { addMinutesToDate, convertUtcToLocal, convertLocalToUtc } from '../shared/timezone';
import { FieldValue } from 'firebase-admin/firestore';

interface ActionRequest {
  entity_type: 'task' | 'document_reminder' | 'routine_step';
  entity_id:   string;
  action:      'complete' | 'snooze';
  snooze?:     number | 'tonight' | 'tomorrow';
}

export const notificationAction = https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid  = request.auth.uid;
    const data = request.data as ActionRequest;

    if (!data.entity_type || !data.entity_id || !data.action) {
      throw new https.HttpsError('invalid-argument', 'entity_type, entity_id, and action are required.');
    }

    const now = new Date().toISOString();

    try {
      switch (data.entity_type) {
        case 'task':
          await handleTaskAction(uid, data, now);
          break;
        case 'document_reminder':
          await handleReminderAction(uid, data, now);
          break;
        case 'routine_step':
          await handleRoutineStepAction(uid, data, now);
          break;
        default:
          throw new https.HttpsError('invalid-argument', `Unknown entity_type: ${data.entity_type}`);
      }

      logger.info(`[notificationAction] ${data.action} on ${data.entity_type} ${data.entity_id} for ${uid}`);
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof https.HttpsError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[notificationAction] Error:', msg);
      throw new https.HttpsError('internal', msg);
    }
  }
);

// ---------------------------------------------------------------------------
// Task action
// ---------------------------------------------------------------------------
async function handleTaskAction(uid: string, data: ActionRequest, now: string): Promise<void> {
  const taskRef = adminDb
    .collection('users').doc(uid)
    .collection('tasks').doc(data.entity_id);

  const snap = await taskRef.get();
  if (!snap.exists) throw new https.HttpsError('not-found', 'Task not found.');

  const task = snap.data()!;

  if (data.action === 'complete') {
    await taskRef.update({ status: 'completed', updatedAt: now });
    return;
  }

  // Snooze — calculate new start time
  const timezone: string = task.timezone ?? 'UTC';
  const snoozeTarget = resolveSnoozeTarget(data.snooze, timezone);
  await taskRef.update({
    startTime:  snoozeTarget.toISOString(),
    taskDate:   snoozeTarget.toISOString().slice(0, 10),
    updatedAt:  now,
    startNotified: false,
    lastReminderSentAt: null,
  });
}

// ---------------------------------------------------------------------------
// Document reminder action
// ---------------------------------------------------------------------------
async function handleReminderAction(uid: string, data: ActionRequest, now: string): Promise<void> {
  const reminderRef = adminDb
    .collection('users').doc(uid)
    .collection('reminders').doc(data.entity_id);

  const snap = await reminderRef.get();
  if (!snap.exists) throw new https.HttpsError('not-found', 'Reminder not found.');

  if (data.action === 'complete') {
    await reminderRef.update({ isSent: true, updatedAt: now });
    return;
  }

  // Snooze — find and update next reminder date
  const profileSnap = await adminDb.doc(profilePath(uid)).get();
  const timezone = (profileSnap.data()?.timezone as string | undefined) ?? 'UTC';
  const snoozeTarget = resolveSnoozeTarget(data.snooze, timezone);
  await reminderRef.update({
    reminderDate: snoozeTarget.toISOString().slice(0, 10),
    isSent:       false,
  });
}

// ---------------------------------------------------------------------------
// Routine step action
// ---------------------------------------------------------------------------
async function handleRoutineStepAction(uid: string, data: ActionRequest, now: string): Promise<void> {
  // data.entity_id is the slot ID — find it across all routines
  const routinesSnap = await adminDb
    .collection('users').doc(uid)
    .collection('routines')
    .get();

  for (const routineDoc of routinesSnap.docs) {
    const tasksSnap = await routineDoc.ref.collection('tasks').get();
    for (const taskDoc of tasksSnap.docs) {
      const slotRef = taskDoc.ref.collection('slots').doc(data.entity_id);
      const slotSnap = await slotRef.get();
      if (!slotSnap.exists) continue;

      if (data.action === 'complete') {
        // Log completion in routine_notification_log
        await adminDb.collection('routine_notification_log').add({
          notificationKey:  `complete_${data.entity_id}_${now}`,
          userId:           uid,
          routineId:        routineDoc.id,
          stepId:           data.entity_id,
          notificationType: 'completed',
          sentAt:           FieldValue.serverTimestamp(),
        });
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Snooze target resolver
// ---------------------------------------------------------------------------
function resolveSnoozeTarget(
  snooze: number | 'tonight' | 'tomorrow' | undefined,
  timezone: string
): Date {
  const nowUtc = new Date();

  if (typeof snooze === 'number') {
    return addMinutesToDate(nowUtc, snooze);
  }

  const localNow = convertUtcToLocal(nowUtc, timezone);

  if (snooze === 'tonight') {
    const tonight = new Date(localNow);
    tonight.setHours(20, 0, 0, 0);
    return convertLocalToUtc(tonight, timezone);
  }

  if (snooze === 'tomorrow') {
    const tomorrow = new Date(localNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return convertLocalToUtc(tomorrow, timezone);
  }

  // Default: 1 hour
  return addMinutesToDate(nowUtc, 60);
}
