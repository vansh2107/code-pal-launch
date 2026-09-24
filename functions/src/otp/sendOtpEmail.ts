/**
 * sendOtpEmail — HTTPS Callable (no auth required)
 *
 * Sends a 6-digit OTP via SendGrid email for phone verification.
 * Rate limits: 3 OTPs/hour per phone, 10/hour per IP.
 * Stores OTP hash in Firestore otp_codes collection (service-only access).
 *
 * Replaces: supabase/functions/send-otp-sms
 */

import { https, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { sendEmail } from '../shared/sendgrid';
import * as crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

interface OtpRequest {
  phoneNumber: string;
  email:       string;
}

const OTP_EXPIRY_MINUTES   = 10;
const RATE_LIMIT_PER_PHONE = 3;
const RATE_LIMIT_PER_IP    = 10;
const RATE_WINDOW_HOURS    = 1;

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export const sendOtpEmail = https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    const { phoneNumber, email } = request.data as OtpRequest;

    if (!phoneNumber || !email) {
      throw new https.HttpsError('invalid-argument', 'phoneNumber and email are required.');
    }

    const ip = request.rawRequest?.ip ?? 'unknown';
    const windowStart = new Date(Date.now() - RATE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    // Rate limit: per phone
    const phoneCountSnap = await adminDb
      .collection('otp_codes')
      .where('phoneNumber', '==', phoneNumber)
      .where('createdAt', '>=', windowStart)
      .get();

    if (phoneCountSnap.size >= RATE_LIMIT_PER_PHONE) {
      throw new https.HttpsError('resource-exhausted', 'Too many OTP requests for this phone number. Try again later.');
    }

    // Rate limit: per IP
    if (ip !== 'unknown') {
      const ipCountSnap = await adminDb
        .collection('otp_codes')
        .where('ipAddress', '==', ip)
        .where('createdAt', '>=', windowStart)
        .get();

      if (ipCountSnap.size >= RATE_LIMIT_PER_IP) {
        throw new https.HttpsError('resource-exhausted', 'Too many OTP requests from this IP. Try again later.');
      }
    }

    // Check for account lock
    const lockSnap = await adminDb
      .collection('otp_codes')
      .where('phoneNumber', '==', phoneNumber)
      .where('lockedUntil', '>', new Date().toISOString())
      .limit(1)
      .get();

    if (!lockSnap.empty) {
      throw new https.HttpsError('resource-exhausted', 'Account is temporarily locked. Please try again later.');
    }

    // Generate and hash OTP
    const otp        = generateOtp();
    const otpHash    = hashOtp(otp);
    const now        = new Date().toISOString();
    const expiresAt  = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    // Store in Firestore
    await adminDb.collection('otp_codes').add({
      phoneNumber,
      otpHash,
      purpose:         'verification',
      expiresAt,
      isVerified:      false,
      deliveryStatus:  'pending',
      failedAttempts:  0,
      ipAddress:       ip,
      createdAt:       now,
      lastOtpSentAt:   FieldValue.serverTimestamp(),
    });

    // Send via SendGrid
    const ok = await sendEmail({
      to:      email,
      subject: '🔐 Your Remonk Verification Code',
      html: `
        <h2>Your Verification Code</h2>
        <p>Your OTP is: <strong style="font-size:2em;letter-spacing:0.2em">${otp}</strong></p>
        <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <p>— Remonk Reminder 🔔</p>
      `,
    });

    if (!ok) {
      throw new https.HttpsError('internal', 'Failed to send OTP email.');
    }

    logger.info(`[sendOtpEmail] OTP sent to ${email} for phone ${phoneNumber.slice(0, 5)}***`);
    return { success: true, message: 'OTP sent to your email.' };
  }
);
