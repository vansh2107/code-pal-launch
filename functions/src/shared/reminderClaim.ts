/**
 * reminderClaim.ts — Atomic reminder claiming + per-channel delivery tracking.
 *
 * Problem this solves:
 *   - Overlapping scheduler runs (every-minute + hourly) could double-send a
 *     reminder. An atomic Firestore-transaction claim prevents that.
 *   - Marking `isSent: true` after a single successful channel permanently
 *     suppressed the other channel's retry. Per-channel flags (`pushSent`,
 *     `emailSent`) let each scheduler retry only the channels that failed.
 *
 * Retry policy: a reminder is claimed for at most CLAIM_WINDOW_MS; each claim
 * increments sendAttempts. After MAX_ATTEMPTS the reminder is marked
 * `sendFailed` (isSent: true) so it stops burning query reads — duplicate-send
 * protection is never bypassed.
 */

import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from './admin';

export const MAX_ATTEMPTS = 5;
export const CLAIM_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/** Which channels the caller still needs to deliver. */
export interface PendingChannels {
  push: boolean;
  email: boolean;
}

export type ClaimFailureReason =
  | 'missing'
  | 'already_sent'
  | 'attempts_exhausted'
  | 'claimed_by_other'
  | 'nothing_pending';

export interface ClaimResult {
  claimed: boolean;
  /** Only meaningful when `claimed` is true. */
  pending: PendingChannels;
  reason?: ClaimFailureReason;
}

interface ClaimOptions {
  wantPush: boolean;
  wantEmail: boolean;
}

/**
 * Atomically claim a reminder for delivery.
 *
 * Returns the channels that still need to be sent (a channel counts as
 * pending only if the caller wants it AND it has not already succeeded).
 * Reminders written before per-channel tracking existed have no `pushSent` /
 * `emailSent` fields and are treated as fully pending.
 */
export async function claimReminder(
  ref: DocumentReference,
  opts: ClaimOptions
): Promise<ClaimResult> {
  const notClaimed = (reason: ClaimFailureReason): ClaimResult => ({
    claimed: false,
    pending: { push: false, email: false },
    reason,
  });

  try {
    return await adminDb.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return notClaimed('missing');

      const data = fresh.data() as Record<string, unknown> | undefined;
      if (!data) return notClaimed('missing');
      if (data.isSent === true) return notClaimed('already_sent');

      const attempts = typeof data.sendAttempts === 'number' ? data.sendAttempts : 0;
      if (attempts >= MAX_ATTEMPTS) {
        // Exhausted: stop retrying permanently, keep audit trail.
        tx.update(ref, {
          isSent: true,
          sendFailed: true,
          sendClaimAt: null,
          lastClaimFailureAt: new Date().toISOString(),
        });
        console.error(
          `[reminderClaim] Reminder ${ref.path} exhausted ${MAX_ATTEMPTS} delivery attempts; marked sendFailed`
        );
        return notClaimed('attempts_exhausted');
      }

      const claimedAt = typeof data.sendClaimAt === 'string' ? Date.parse(data.sendClaimAt) : NaN;
      if (Number.isFinite(claimedAt) && Date.now() - claimedAt < CLAIM_WINDOW_MS) {
        return notClaimed('claimed_by_other');
      }

      const pending: PendingChannels = {
        push:  opts.wantPush  && data.pushSent  !== true,
        email: opts.wantEmail && data.emailSent !== true,
      };

      if (!pending.push && !pending.email) {
        // Every wanted channel already succeeded — finish the reminder.
        tx.update(ref, { isSent: true, sendClaimAt: null });
        return notClaimed('nothing_pending');
      }

      tx.update(ref, {
        sendClaimAt: new Date().toISOString(),
        sendAttempts: attempts + 1,
      });
      return { claimed: true, pending };
    });
  } catch (err: unknown) {
    console.error(`[reminderClaim] Claim transaction failed for ${ref.path}:`, err);
    return notClaimed('claimed_by_other');
  }
}

/** Clear the claim so a later run can retry the failed channels. */
export async function releaseReminderClaim(ref: DocumentReference): Promise<void> {
  try {
    await ref.update({ sendClaimAt: null });
  } catch (err: unknown) {
    console.error(`[reminderClaim] Failed to release claim on ${ref.path}:`, err);
  }
}

/**
 * Record the outcome of a delivery attempt.
 *
 * - Only channels that were attempted and succeeded are flipped to true —
 *   a failed channel stays false so the next run retries it.
 * - `isSent` is set only when every wanted channel has now succeeded.
 */
export async function recordDeliveryResult(
  ref: DocumentReference,
  opts: ClaimOptions,
  attempted: PendingChannels,
  results: { pushOk: boolean; emailOk: boolean }
): Promise<boolean> {
  const update: Record<string, unknown> = { sendClaimAt: null };

  if (attempted.push && results.pushOk) update.pushSent = true;
  if (attempted.email && results.emailOk) update.emailSent = true;

  const allDone =
    (!attempted.push || results.pushOk) &&
    (!attempted.email || results.emailOk);

  if (allDone) {
    update.isSent = true;
    update.sentAt = new Date().toISOString();
  }

  try {
    await ref.update(update);
    return allDone;
  } catch (err: unknown) {
    // Best effort: a failure here means the next run may resend a succeeded
    // channel, which is safer than losing the reminder entirely.
    console.error(`[reminderClaim] Failed to record delivery for ${ref.path}:`, err);
    return false;
  }
}
