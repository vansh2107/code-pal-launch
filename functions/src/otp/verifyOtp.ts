/**
 * verifyOtp — HTTPS Callable (no auth required)
 *
 * Validates OTP code. Brute-force protection: locks for 1 hour after 5
 * failed attempts. Anti-enumeration: same response for not-found and invalid.
 *
 * Replaces: supabase/functions/verify-otp
 */

import { https, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import * as crypto from 'crypto';

interface VerifyOtpRequest {
  phoneNumber: string;
  otpCode:     string;
}

const MAX_ATTEMPTS    = 5;
const LOCK_DURATION_H = 1;

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export const verifyOtp = https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    const { phoneNumber, otpCode } = request.data as VerifyOtpRequest;

    if (!phoneNumber || !otpCode) {
      throw new https.HttpsError('invalid-argument', 'phoneNumber and otpCode are required.');
    }

    const now    = new Date().toISOString();
    const hash   = hashOtp(otpCode.trim());

    // Find the most recent unexpired OTP for this phone
    const snap = await adminDb
      .collection('otp_codes')
      .where('phoneNumber', '==', phoneNumber)
      .where('isVerified', '==', false)
      .where('expiresAt', '>', now)
      .orderBy('expiresAt', 'desc')
      .limit(1)
      .get();

    // Anti-enumeration: same response whether not-found or wrong code
    if (snap.empty) {
      return { success: false, message: 'Invalid or expired OTP.' };
    }

    const docRef  = snap.docs[0].ref;
    const docData = snap.docs[0].data();

    // Check lock
    if (docData.lockedUntil && docData.lockedUntil > now) {
      return { success: false, message: 'Account locked. Please request a new OTP.' };
    }

    // Verify hash
    if (docData.otpHash !== hash) {
      const attempts = (docData.failedAttempts ?? 0) + 1;
      const updates: Record<string, unknown> = { failedAttempts: attempts };

      if (attempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCK_DURATION_H * 60 * 60 * 1000).toISOString();
        updates.lockedUntil = lockedUntil;
        logger.warn(`[verifyOtp] Account locked for phone ${phoneNumber.slice(0, 5)}***`);
      }

      await docRef.update(updates);
      return { success: false, message: 'Invalid or expired OTP.' };
    }

    // Mark as verified
    await docRef.update({
      isVerified:  true,
      consumedAt:  now,
    });

    logger.info(`[verifyOtp] OTP verified for phone ${phoneNumber.slice(0, 5)}***`);
    return { success: true, message: 'OTP verified successfully.' };
  }
);
