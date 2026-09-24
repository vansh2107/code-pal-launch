/**
 * sendImmediateReminder — HTTPS Callable
 *
 * Sends a confirmation email when a user sets a reminder.
 * Replaces: supabase/functions/send-immediate-reminder
 */

import { https, logger } from 'firebase-functions/v2';
import { adminDb } from '../shared/admin';
import { profilePath } from '../shared/database';
import { sendEmail } from '../shared/sendgrid';

interface RequestData {
  reminderId: string;
}

export const sendImmediateReminder = https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new https.HttpsError('unauthenticated', 'Authentication required.');
    }

    const uid  = request.auth.uid;
    const { reminderId } = request.data as RequestData;

    if (!reminderId) {
      throw new https.HttpsError('invalid-argument', 'reminderId is required.');
    }

    // Fetch profile
    const profileSnap = await adminDb.doc(profilePath(uid)).get();
    const profile = profileSnap.data();

    if (!profile?.email) {
      return { success: false, message: 'No email address on profile.' };
    }
    if (profile.emailNotificationsEnabled === false) {
      return { success: false, message: 'Email notifications disabled.' };
    }
    if (profile.expiryRemindersEnabled === false) {
      return { success: false, message: 'Expiry reminders disabled.' };
    }

    // Fetch reminder + document
    const reminderSnap = await adminDb
      .collection('users').doc(uid)
      .collection('reminders').doc(reminderId).get();

    if (!reminderSnap.exists) {
      throw new https.HttpsError('not-found', 'Reminder not found.');
    }

    const reminder = reminderSnap.data()!;
    const docSnap = await adminDb
      .collection('users').doc(uid)
      .collection('documents').doc(reminder.documentId).get();

    const documentName = docSnap.exists ? (docSnap.data()!.name as string) : 'Your document';

    const ok = await sendEmail({
      to:      profile.email as string,
      subject: `📄 Reminder set: ${documentName}`,
      html:    `
        <h2>Reminder Confirmed!</h2>
        <p>You've set a reminder for <strong>${documentName}</strong>.</p>
        <p>We'll remind you on <strong>${reminder.reminderDate}</strong>.</p>
        <p>Stay organised! — Remonk Reminder 🔔</p>
      `,
    });

    logger.info(`[sendImmediateReminder] Email sent=${ok} for reminder ${reminderId}`);
    return { success: ok };
  }
);
