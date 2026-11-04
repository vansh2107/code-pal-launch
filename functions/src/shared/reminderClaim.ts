/**
 * Atomic reminder claim + retry bookkeeping.
 *
 * Used by the document reminder schedulers so that:
 *  - overlapping / retried executions never double-send a reminder,
 *  - a failed delivery is released for retry (isSent stays false),
 *  - retries are bounded (no unbounded retry loop).
 */

import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from './admin';

/** A claimed reminder cannot be re-claimed within this window. */
export const REMINDER_CLAIM_LOCK_MS = 10 * 60 * 1000;

/** Maximum delivery attempts before a reminder stops being retried. */
export const REMINDER_MAX_ATTEMPTS = 5;

/**
 * Atomically claim a reminder for sending.
 *
 * Returns false (and sends nothing) when the reminder:
 *  - is already sent,
 *  - is currently claimed by another in-flight run (lock window),
 *  - has exhausted its retry budget.
 */
export async function claimReminderForSend(
  reminderRef: DocumentReference
): Promise<boolean> {
  const nowMs = Date.now();
  return adminDb.runTransaction(async (tx) => {
    const fresh = (await tx.get(reminderRef)).data();
    if (!fresh || fresh.isSent) return false;

    const attempts = typeof fresh.sendAttempts === 'number' ? fresh.sendAttempts : 0;
    if (attempts >= REMINDER_MAX_ATTEMPTS) {
      if (!fresh.retryExhaustedAt) {
        tx.update(reminderRef, { retryExhaustedAt: new Date(nowMs).toISOString() });
      }
      return false;
    }

    const claimedAt = fresh.sendClaimAt ? Date.parse(fresh.sendClaimAt) : NaN;
    if (Number.isFinite(claimedAt) && nowMs - claimedAt < REMINDER_CLAIM_LOCK_MS) {
      return false;
    }

    tx.update(reminderRef, { sendClaimAt: new Date(nowMs).toISOString() });
    return true;
  });
}

/**
 * Release the claim after a failed delivery and count the attempt.
 * The reminder stays isSent=false so a later run can retry it.
 */
export async function releaseReminderClaim(
  reminderRef: DocumentReference
): Promise<void> {
  const snap = await reminderRef.get();
  const current = snap.data();
  const attempts = typeof current?.sendAttempts === 'number' ? current.sendAttempts : 0;
  await reminderRef.update({
    sendClaimAt: null,
    sendAttempts: attempts + 1,
  });
}

/** Mark a reminder as delivered (provider accepted at least one channel). */
export async function markReminderSent(reminderRef: DocumentReference): Promise<void> {
  await reminderRef.update({
    isSent: true,
    sendClaimAt: null,
    sentAt: new Date().toISOString(),
  });
}
