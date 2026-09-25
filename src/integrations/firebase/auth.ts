/**
 * src/integrations/firebase/auth.ts
 *
 * Firebase Authentication layer — clean typed wrappers for every auth
 * operation the Remonk application requires.
 *
 * This file is the NEW auth implementation that will replace Supabase Auth
 * in Phase 4.  It is NOT imported by any existing page or hook yet.
 * Existing Supabase auth (useAuth.tsx, Auth.tsx, ResetPassword.tsx) continues
 * to work unchanged.
 *
 * Operations provided
 * ───────────────────
 *  signUp               — create account + send email verification
 *  signIn               — sign in with email/password
 *  signOut              — sign out current user
 *  sendPasswordReset    — send password-reset email
 *  confirmPasswordReset — complete password reset with action code + new password
 *  updatePassword       — update password for authenticated user
 *  sendVerificationEmail — re-send email verification link
 *  onAuthChange         — subscribe to auth state changes
 *  getCurrentUser       — synchronous current user accessor
 *  getIdToken           — get current ID token (for Cloud Function calls)
 *  deleteAccount        — delete account via secure Cloud Function
 *
 * Design notes
 * ────────────
 *  - All functions return a discriminated union { ok: true; ... } | { ok: false; error: string }
 *    so callers can handle errors without try/catch.
 *  - Firebase email verification replaces the manual 6-digit OTP flow
 *    that Supabase uses (Auth.tsx verifyOtp step).
 *  - Password reset uses Firebase action codes — no PKCE exchange needed.
 *  - Account deletion calls the deleteUserAccount Cloud Function which uses
 *    the Admin SDK, matching the existing Supabase pattern exactly.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  updatePassword as firebaseUpdatePassword,
  sendEmailVerification,
  onAuthStateChanged,
  type User,
  type ActionCodeSettings,
  type Unsubscribe,
  updateProfile,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { firebaseAuth, firebaseFunctions } from './client';

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export type AuthResult<T = void> =
  | { ok: true;  data: T; error?: undefined; code?: undefined }
  | { ok: false; error: string; code?: string };

/** Metadata passed during sign-up to pre-populate the Firestore profile. */
export interface SignUpMetadata {
  displayName: string;
  country:     string;
  phoneNumber: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action code settings
// These tell Firebase where to redirect after the user clicks an email link.
// ─────────────────────────────────────────────────────────────────────────────

/** Action code settings for email verification links. */
const emailVerificationSettings: ActionCodeSettings = {
  // After clicking the verification link, Firebase redirects here.
  // Falls back to the authDomain from env if window is unavailable (SSR/tests).
  url: typeof window !== 'undefined'
    ? `${window.location.origin}/`
    : `https://${import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? ''}/`,
  handleCodeInApp: false,
};

/** Action code settings for password-reset links. */
const passwordResetSettings: ActionCodeSettings = {
  url: typeof window !== 'undefined'
    ? `${window.location.origin}/reset-password`
    : `https://${import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? ''}/reset-password`,
  handleCodeInApp: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a Firebase AuthError code into a user-readable message. */
function authErrorMessage(err: unknown): { message: string; code: string } {
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'message' in err
  ) {
    const e = err as { code: string; message: string };
    const code = e.code as string;

    const messages: Record<string, string> = {
      'auth/email-already-in-use':   'An account with this email already exists. Please sign in instead.',
      'auth/invalid-email':          'Please enter a valid email address.',
      'auth/weak-password':          'Password must be at least 6 characters.',
      'auth/wrong-password':         'Invalid email or password. Please try again.',
      'auth/user-not-found':         'Invalid email or password. Please try again.',
      'auth/invalid-credential':     'Invalid email or password. Please try again.',
      'auth/too-many-requests':      'Too many failed attempts. Please try again later or reset your password.',
      'auth/user-disabled':          'This account has been disabled. Please contact support.',
      'auth/network-request-failed': 'Network error. Please check your connection and try again.',
      'auth/requires-recent-login':  'For security, please sign in again before changing your password.',
      'auth/expired-action-code':    'This link has expired. Please request a new one.',
      'auth/invalid-action-code':    'This link is invalid or has already been used.',
    };

    return {
      message: messages[code] ?? e.message,
      code,
    };
  }
  return { message: String(err), code: 'unknown' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Sign Up
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new Firebase Auth account.
 *
 * Flow:
 *   1. createUserWithEmailAndPassword
 *   2. updateProfile with displayName
 *   3. sendEmailVerification
 *
 * The onUserCreate Cloud Function trigger automatically creates
 * users/{uid}/profile in Firestore after step 1.
 *
 * After sign-up the user receives a verification email.
 * The app should show "check your email" rather than immediately
 * navigating to the dashboard — email verification is required.
 *
 * @param email        User's email address
 * @param password     Password (validated by caller before calling this)
 * @param metadata     displayName, country, phoneNumber
 */
export async function signUp(
  email: string,
  password: string,
  metadata: SignUpMetadata,
): Promise<AuthResult<User>> {
  try {
    const credential = await createUserWithEmailAndPassword(
      firebaseAuth,
      email,
      password,
    );

    const user = credential.user;

    // Update the Auth displayName so it is available in onUserCreate trigger.
    try {
      await updateProfile(user, { displayName: metadata.displayName });
    } catch {
      // Non-critical — profile trigger will use null displayName instead.
    }

    // Send verification email.
    try {
      await sendEmailVerification(user, emailVerificationSettings);
    } catch {
      // Non-critical — user can request another verification email.
    }

    return { ok: true, data: user };
  } catch (err) {
    const { message, code } = authErrorMessage(err);
    return { ok: false, error: message, code };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sign In
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sign in with email and password.
 *
 * @param email     User's email address
 * @param password  User's password
 */
export async function signIn(
  email: string,
  password: string,
): Promise<AuthResult<User>> {
  try {
    const credential = await signInWithEmailAndPassword(
      firebaseAuth,
      email,
      password,
    );
    return { ok: true, data: credential.user };
  } catch (err) {
    const { message, code } = authErrorMessage(err);
    return { ok: false, error: message, code };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Sign Out
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<AuthResult> {
  try {
    await firebaseSignOut(firebaseAuth);
    return { ok: true, data: undefined };
  } catch (err) {
    const { message, code } = authErrorMessage(err);
    return { ok: false, error: message, code };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Password Reset
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a password-reset email.
 *
 * Firebase sends a link that the user clicks; the app's /reset-password
 * page then calls confirmPasswordReset() with the oobCode from the URL
 * and the new password.
 *
 * @param email  User's email address
 */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  try {
    await sendPasswordResetEmail(firebaseAuth, email, passwordResetSettings);
    return { ok: true, data: undefined };
  } catch (err) {
    const { message, code } = authErrorMessage(err);
    return { ok: false, error: message, code };
  }
}

/**
 * Complete a password reset using the action code from the email link.
 *
 * The /reset-password page extracts the `oobCode` URL parameter and
 * passes it here along with the new password chosen by the user.
 *
 * @param oobCode     Action code from the reset-password URL
 * @param newPassword New password
 */
export async function confirmPasswordReset(
  oobCode: string,
  newPassword: string,
): Promise<AuthResult> {
  try {
    await firebaseConfirmPasswordReset(firebaseAuth, oobCode, newPassword);
    return { ok: true, data: undefined };
  } catch (err) {
    const { message, code } = authErrorMessage(err);
    return { ok: false, error: message, code };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Password Update (authenticated user)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the password for the currently signed-in user.
 *
 * Requires a recent sign-in — Firebase will throw
 * auth/requires-recent-login if the session is too old.
 * The caller should handle that by prompting re-authentication.
 *
 * @param newPassword  New password
 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    return { ok: false, error: 'No user is signed in.', code: 'auth/no-current-user' };
  }

  try {
    await firebaseUpdatePassword(user, newPassword);
    return { ok: true, data: undefined };
  } catch (err) {
    const { message, code } = authErrorMessage(err);
    return { ok: false, error: message, code };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Email Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send (or re-send) the email verification link to the current user.
 *
 * Call this if the user requests a new link from the "verify your email"
 * screen, or after sign-up if the original send failed.
 */
export async function sendVerificationEmail(): Promise<AuthResult> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    return { ok: false, error: 'No user is signed in.', code: 'auth/no-current-user' };
  }
  if (user.emailVerified) {
    return { ok: true, data: undefined }; // already verified — no-op
  }

  try {
    await sendEmailVerification(user, emailVerificationSettings);
    return { ok: true, data: undefined };
  } catch (err) {
    const { message, code } = authErrorMessage(err);
    return { ok: false, error: message, code };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Auth State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to Firebase Auth state changes.
 *
 * Returns an unsubscribe function — call it in a cleanup effect.
 *
 * Replaces: supabase.auth.onAuthStateChange()
 *
 * @param callback  Receives (user | null) on every auth state change
 */
export function onAuthChange(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(firebaseAuth, callback);
}

/**
 * Return the currently signed-in Firebase user, or null.
 * Synchronous — reads from the in-memory SDK state.
 *
 * Replaces: supabase.auth.getSession() / supabase.auth.getUser()
 */
export function getCurrentUser(): User | null {
  return firebaseAuth.currentUser;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ID Token
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the current user's Firebase ID token.
 *
 * Used to authenticate calls to Cloud Functions via the
 * Authorization: Bearer <token> header.
 *
 * @param forceRefresh  Pass true to bypass the 1-hour cache and force a refresh
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Account Deletion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete the current user's Firebase Auth account.
 *
 * The caller (useFirebaseAuth hook, Phase 4) is expected to:
 *   1. Delete all Firestore sub-collections for the user.
 *   2. Delete all Firebase Storage files for the user.
 *   3. Call this function.
 *
 * This function delegates to the deleteUserAccount Cloud Function which
 * uses the Admin SDK — matching the existing Supabase pattern where the
 * frontend calls the edge function to perform the final auth deletion.
 *
 * Replaces: supabase.functions.invoke('delete-user-account')
 */
export async function deleteAccount(): Promise<AuthResult> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    return { ok: false, error: 'No user is signed in.', code: 'auth/no-current-user' };
  }

  try {
    const deleteFn = httpsCallable<Record<string, never>, { success: boolean }>(
      firebaseFunctions,
      'deleteUserAccount',
    );
    const result = await deleteFn({});
    if (!result.data.success) {
      return { ok: false, error: 'Account deletion failed.', code: 'functions/internal' };
    }
    // Sign out locally after server-side deletion.
    await firebaseSignOut(firebaseAuth);
    return { ok: true, data: undefined };
  } catch (err) {
    const { message, code } = authErrorMessage(err);
    return { ok: false, error: message, code };
  }
}
