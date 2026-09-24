/**
 * functions/src/shared/database.ts
 *
 * Firestore Admin SDK helper functions used by multiple Cloud Functions.
 *
 * Profile path convention
 * ───────────────────────
 * Profile documents live at:
 *   users/{uid}/profile/data
 *
 * Path breakdown (Firestore alternating collection/document rule):
 *   collection "users"  → document uid  → sub-collection "profile"  → document "data"
 *
 * collectionGroup('profile') queries work because the sub-collection is
 * named "profile" — this is used by all scheduler functions to fan out
 * notifications across all users.
 */

import { adminDb } from './admin';
import type { UserProfile, FirestoreTask } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Profile helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical Firestore path for a user's profile document.
 * Always use this helper — never hard-code the path.
 */
export function profilePath(uid: string): string {
  return `users/${uid}/profile/data`;
}

/**
 * Fetch a single user's profile.
 * Returns null on not-found or error.
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const snap = await adminDb.doc(profilePath(userId)).get();
    if (!snap.exists) return null;
    return snap.data() as UserProfile;
  } catch (err) {
    console.error('[database] fetchUserProfile error:', err);
    return null;
  }
}

/**
 * Fetch all profiles that have both timezone and preferred_notification_time set.
 * Used by scheduler functions to fan out time-aware notifications.
 *
 * @param pushOnly  When true, only return profiles with pushNotificationsEnabled == true
 */
export async function fetchProfilesWithTimezone(
  pushOnly = false,
): Promise<UserProfile[]> {
  try {
    let query = adminDb
      .collectionGroup('profile')
      .where('timezone', '!=', null);

    if (pushOnly) {
      query = adminDb
        .collectionGroup('profile')
        .where('pushNotificationsEnabled', '==', true)
        .where('timezone', '!=', null);
    }

    const snap = await query.get();
    return snap.docs
      .map((d) => d.data() as UserProfile)
      .filter((p) => p.userId && p.timezone);
  } catch (err) {
    console.error('[database] fetchProfilesWithTimezone error:', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch active (non-completed, reminder-active) tasks for a user.
 *
 * @param userId           Firebase Auth UID
 * @param includeCompleted Pass true to also return completed tasks
 */
export async function fetchActiveTasksForUser(
  userId: string,
  includeCompleted = false,
): Promise<FirestoreTask[]> {
  try {
    let query = adminDb
      .collection('users')
      .doc(userId)
      .collection('tasks')
      .where('reminderActive', '==', true)
      .orderBy('startTime', 'asc');

    if (!includeCompleted) {
      query = adminDb
        .collection('users')
        .doc(userId)
        .collection('tasks')
        .where('reminderActive', '==', true)
        .where('status', '!=', 'completed')
        .orderBy('status', 'asc')
        .orderBy('startTime', 'asc');
    }

    const snap = await query.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FirestoreTask);
  } catch (err) {
    console.error('[database] fetchActiveTasksForUser error:', err);
    return [];
  }
}

/**
 * Update the lastReminderSentAt timestamp on a task.
 */
export async function updateTaskReminderTimestamp(
  userId: string,
  taskId: string,
): Promise<boolean> {
  try {
    await adminDb
      .collection('users')
      .doc(userId)
      .collection('tasks')
      .doc(taskId)
      .update({ lastReminderSentAt: new Date().toISOString() });
    return true;
  } catch (err) {
    console.error('[database] updateTaskReminderTimestamp error:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile upsert helper (used by update-notification-token and schedulers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert (merge) a partial profile update.
 * Creates the profile document if it does not exist (repair scenario).
 */
export async function upsertProfileFields(
  userId: string,
  fields: Partial<UserProfile>,
): Promise<void> {
  await adminDb
    .doc(profilePath(userId))
    .set({ ...fields, updatedAt: new Date().toISOString() }, { merge: true });
}
