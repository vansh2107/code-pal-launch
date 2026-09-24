/**
 * Firebase Web SDK client initialisation.
 *
 * All values are read from Vite environment variables so that no secrets are
 * hard-coded and the build remains compatible with the existing Vite +
 * Capacitor WebView setup.
 *
 * IMPORTANT: Firebase web config values (apiKey, appId, etc.) are *not*
 * secret — they are safe to include in the client bundle.  They identify the
 * Firebase project but access is governed by Firebase Security Rules and
 * Auth.  Do NOT confuse them with the Firebase Admin service-account key,
 * which must NEVER appear in frontend code.
 *
 * Usage:
 *   import { firebaseApp, firebaseAuth, firebaseDb, firebaseStorage, firebaseFunctions } from '@/integrations/firebase/client';
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';

// ---------------------------------------------------------------------------
// Config — sourced exclusively from environment variables.
// Vite exposes VITE_* variables to the client bundle at build time.
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
};

// Guard: warn in development if any required variable is missing.
if (import.meta.env.DEV) {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => `VITE_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
  if (missing.length > 0) {
    console.warn(
      '[Firebase] The following environment variables are not set — Firebase features will not work:\n' +
      missing.map(k => `  ${k}`).join('\n') +
      '\nCopy .env.example to .env and fill in the values.'
    );
  }
}

// ---------------------------------------------------------------------------
// App — initialise once; reuse existing instance on hot-reload.
// ---------------------------------------------------------------------------
export const firebaseApp: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
export const firebaseAuth: Auth       = getAuth(firebaseApp);
export const firebaseDb: Firestore    = getFirestore(firebaseApp);
export const firebaseStorage: FirebaseStorage = getStorage(firebaseApp);
export const firebaseFunctions: Functions = getFunctions(firebaseApp);

// Short aliases for convenience
export const auth = firebaseAuth;
export const db = firebaseDb;
export const storage = firebaseStorage;
export const functions = firebaseFunctions;

// ---------------------------------------------------------------------------
// Local emulator support
// Connect to the Firebase Local Emulator Suite when
// VITE_FIREBASE_USE_EMULATOR=true so developers can work fully offline
// without touching the production project.
// ---------------------------------------------------------------------------
const useEmulator = import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true';

if (useEmulator) {
  // Each emulator is connected at most once per app instance.
  // The SDK will warn and no-op on duplicate connect() calls, so this
  // is safe even with Vite HMR.
  try {
    connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: false });
    connectFirestoreEmulator(firebaseDb, '127.0.0.1', 8080);
    connectStorageEmulator(firebaseStorage, '127.0.0.1', 9199);
    connectFunctionsEmulator(firebaseFunctions, '127.0.0.1', 5001);
    console.info('[Firebase] Connected to local emulators.');
  } catch {
    // Already connected — safe to ignore on HMR re-execution.
  }
}
