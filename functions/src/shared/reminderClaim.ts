/**
 * reminderClaim.ts — Atomic reminder claiming + per-channel delivery tracking.
 *
 * Problem this solves:
 *   - Overlapping scheduler runs could double-send a reminder. An atomic
 *     Firestore-transaction claim prevents that.
 *   - Push notification (OneSignal) is our primary delivery channel (mobile & web).
 *   - Email notification (SendGrid) is supported when configured. If SendGrid is
 *     not configured or fails while push succeeds, email failure must NOT block
 *     the reminder from completing or burn MAX_ATTEMPTS.
 *   - Per-channel flags (`pushSent`, `emailSent`) ensure no duplicate messages.
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

export interface ClaimOptions {
  wantPush: boolean;
  wantEmail: boolean;
}

/**
 * Atomically claim a reminder for delivery.
 *
 * Returns the channels that still need to be sent (a channel counts as
 * pending only if the caller wants it AND it has not already succeeded).
 * Also performs self-healing: if a reminder was previously marked `sendFailed`
 * due to email/SendGrid issues while push never succeeded, it can be claimed again.
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

      // Self-healing: if marked sendFailed but push was never sent, allow retrying push
      const isStaleSendFailed = data.sendFailed === true && data.pushSent !== true;

      if (data.isSent === true && !isStaleSendFailed) return notClaimed('already_sent');

      const attempts = typeof data.sendAttempts === 'number' ? data.sendAttempts : 0;
      if (attempts >= MAX_ATTEMPTS && !isStaleSendFailed) {
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
        tx.update(ref, { isSent: true, sendClaimAt: null, sendFailed: false });
        return notClaimed('nothing_pending');
      }

      const updateData: Record<string, unknown> = {
        sendClaimAt: new Date().toISOString(),
        sendAttempts: isStaleSendFailed ? 1 : attempts + 1,
      };

      if (isStaleSendFailed) {
        updateData.sendFailed = false;
        updateData.isSent = false;
      }

      tx.update(ref, updateData);
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
 * Rules:
 * - If pushOk succeeds, or if push was not wanted / already sent, push is satisfied.
 * - If push succeeds, email is best-effort: the reminder is considered delivered (`isSent: true`).
 * - If email succeeds, emailSent is recorded.
 * - If push fails (when attempted), the reminder is NOT marked allDone, so it will retry.
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

  // Primary delivery channel is push.
  // Delivery is considered complete (allDone) if:
  // 1) Both attempted channels succeeded, OR
  // 2) Push succeeded (email is best-effort and won't block delivery completion), OR
  // 3) Push was not wanted/needed and email succeeded
  const pushSatisfied = !opts.wantPush || (attempted.push ? results.pushOk : true);
  const emailSatisfied = !opts.wantEmail || (attempted.email ? results.emailOk : true);

  const allDone = (attempted.push && results.pushOk) || (pushSatisfied && emailSatisfied);

  if (allDone) {
    update.isSent = true;
    update.sentAt = new Date().toISOString();
    update.sendFailed = false;
  }

  try {
    await ref.update(update);
    return allDone;
  } catch (err: unknown) {
    console.error(`[reminderClaim] Failed to record delivery for ${ref.path}:`, err);
    return false;
  }
}
