/**
 * Firebase Admin SDK singleton.
 *
 * Initialises firebase-admin once per Cloud Functions instance.
 * In the Cloud Functions runtime the SDK is automatically authenticated
 * using the function's service account — no credential file or
 * GOOGLE_APPLICATION_CREDENTIALS env var is needed in production.
 *
 * IMPORTANT: This file must NEVER be imported into frontend (src/) code.
 * The service account has elevated privileges.
 */

import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const adminAuth    = admin.auth();
export const adminDb      = admin.firestore();
export const adminStorage = admin.storage();

export default admin;
