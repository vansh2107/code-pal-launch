/**
 * App Lock — native biometric / device-credential authentication.
 *
 * Only active on native Capacitor platforms. On web it is a no-op so
 * the browser/desktop experience is never broken.
 *
 * Security contract:
 *  - Never stores PIN, password, or biometric data.
 *  - Stores only a single boolean flag ("app lock has been initialised")
 *    in localStorage, plus the timestamp of the last successful auth
 *    so we can avoid re-prompting while the user is actively using the app.
 *  - On sign-out the in-memory lock state is reset so the next launch
 *    requires authentication again.
 */

import { Capacitor } from "@capacitor/core";

// ── Constants ──────────────────────────────────────────────────────────────
const LOCK_INIT_KEY = "remonk_app_lock_init";
const LAST_AUTH_KEY = "remonk_app_lock_last_auth";

/**
 * How long (ms) after a successful authentication the app stays unlocked
 * when it returns to the foreground.  30 seconds: short enough to be
 * meaningful security, long enough that a user switching apps quickly
 * isn't constantly re-prompted.
 */
const BACKGROUND_GRACE_MS = 30_000;

// ── In-memory state (reset on every cold boot / sign-out) ──────────────────
let _unlocked = false;

// ── Helpers ────────────────────────────────────────────────────────────────

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Persist the timestamp of the last successful auth. */
function stampLastAuth(): void {
  try {
    localStorage.setItem(LAST_AUTH_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — not fatal */
  }
}

/** Return true if the last auth was recent enough that we should skip re-prompting. */
function withinGracePeriod(): boolean {
  try {
    const raw = localStorage.getItem(LAST_AUTH_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < BACKGROUND_GRACE_MS;
  } catch {
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns true if app lock is enabled (i.e. we are on a native platform).
 * On web this always returns false.
 */
export function isAppLockEnabled(): boolean {
  return isNative();
}

/**
 * True when the app is currently considered unlocked in this session.
 * Callers should use this to decide whether to show the lock overlay.
 */
export function isUnlocked(): boolean {
  if (!isNative()) return true; // web: always unlocked
  return _unlocked;
}

/**
 * Called when the app moves to the foreground (appStateChange → isActive).
 * Returns true if we need to show the lock screen again.
 */
export function shouldLockOnResume(): boolean {
  if (!isNative()) return false;
  if (!_unlocked) return true; // already locked
  // If the user returns from background quickly we don't re-lock
  return !withinGracePeriod();
}

/**
 * Attempt native biometric / device-credential authentication.
 * Returns true on success, false on failure or cancellation.
 *
 * Uses `capacitor-native-biometric` which delegates to:
 *   Android — BiometricPrompt (fingerprint, face, PIN, pattern, password)
 *   iOS     — LocalAuthentication (Face ID, Touch ID, passcode)
 */
export async function authenticate(): Promise<boolean> {
  if (!isNative()) {
    // Web fallback: treat as always authenticated
    _unlocked = true;
    return true;
  }

  try {
    const { NativeBiometric } = await import("capacitor-native-biometric");

    // Check whether the device has any credential enrolled.
    const available = await NativeBiometric.isAvailable();
    if (!available.isAvailable) {
      // Device has no biometrics AND no fallback credential configured.
      // Grant access rather than permanently locking the user out.
      console.warn("[AppLock] No biometric/credential available — granting access");
      _unlocked = true;
      stampLastAuth();
      return true;
    }

    await NativeBiometric.verifyIdentity({
      reason: "Verify your identity to access Remonk Reminder",
      title: "App Lock",
      subtitle: "Use your device security to continue",
      description: "Fingerprint, Face ID, PIN, or password",
      // Allow device PIN/password/pattern as fallback when biometrics fail
      useFallback: true,
      maxAttempts: 3,
    });

    _unlocked = true;
    stampLastAuth();
    markInitialised();
    return true;
  } catch (err: any) {
    // NativeBiometric throws on cancellation AND on failure.
    // We do NOT unlock on error — keep the gate closed.
    console.warn("[AppLock] Authentication failed or cancelled:", err?.message ?? err);
    _unlocked = false;
    return false;
  }
}

/**
 * Mark that the lock has been initialised on this device.
 * Stored locally so we know this is not a first-ever cold start.
 */
export function markInitialised(): void {
  try {
    localStorage.setItem(LOCK_INIT_KEY, "1");
  } catch {
    /* noop */
  }
}

/**
 * Reset the in-memory unlock state (called on sign-out).
 * Does NOT remove the init flag — we want to keep locking on subsequent logins.
 */
export function resetLockState(): void {
  _unlocked = false;
  try {
    localStorage.removeItem(LAST_AUTH_KEY);
  } catch {
    /* noop */
  }
}

/**
 * True if this device has ever successfully completed app-lock auth before.
 */
export function hasBeenInitialised(): boolean {
  try {
    return localStorage.getItem(LOCK_INIT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Lock the app immediately (e.g. after background timeout).
 */
export function lockNow(): void {
  _unlocked = false;
}
