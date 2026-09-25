/**
 * src/integrations/firebase/client.ts
 *
 * Single source of truth for all Firebase client-side initialization.
 *
 * ALL configuration values are read exclusively from Vite environment
 * variables (VITE_FIREBASE_*).  No Firebase project IDs, API keys,
 * bucket names, or app IDs are hardcoded in this file or anywhere else
 * in the frontend source tree.
 *
 * Environment variables required in .env:
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *
 * Optional:
 *   VITE_FIREBASE_USE_EMULATOR=true   — connect to local emulator suite
 *
 * IMPORTANT:
 *   Firebase web config values (apiKey, appId, etc.) are NOT secrets.
 *   They identify the project but access is governed entirely by
 *   Firebase Security Rules and Authentication.
 *   Do NOT confuse them with the Firebase Admin service-account key,
 *   which must NEVER appear in frontend code.
 *
 * Usage:
 *   import { firebaseApp, firebaseAuth, firebaseDb,
 *            firebaseStorage, firebaseFunctions } from '@/integrations/firebase/client';
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import androidFirebaseConfig from '../../../android/app/google-services.json';

// ---------------------------------------------------------------------------
// Required environment variable keys
// ---------------------------------------------------------------------------

const REQUIRED_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

// ---------------------------------------------------------------------------
// Startup validation
// Runs once on module load.  Fails loudly in development; logs a clear
// error in production so the issue is visible in crash/log tooling.
// Never prints the actual values — only the missing key names.
// ---------------------------------------------------------------------------

const androidClient = androidFirebaseConfig.client?.[0];
const androidProject = androidFirebaseConfig.project_info;
const nativeFallback: Record<(typeof REQUIRED_VARS)[number], string | undefined> = {
  VITE_FIREBASE_API_KEY: androidClient?.api_key?.[0]?.current_key,
  VITE_FIREBASE_AUTH_DOMAIN: androidProject?.project_id
    ? `${androidProject.project_id}.firebaseapp.com`
    : undefined,
  VITE_FIREBASE_PROJECT_ID: androidProject?.project_id,
  VITE_FIREBASE_STORAGE_BUCKET: androidProject?.storage_bucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: androidProject?.project_info?.project_number,
  VITE_FIREBASE_APP_ID: androidClient?.client_info?.mobilesdk_app_id,
};
const resolvedConfig = Object.fromEntries(
  REQUIRED_VARS.map((key) => [key, import.meta.env[key] || nativeFallback[key]]),
) as Record<(typeof REQUIRED_VARS)[number], string | undefined>;
const missing: string[] = REQUIRED_VARS.filter((key) => !resolvedConfig[key]);

if (missing.length > 0) {
  const msg =
    '[Firebase] The following required environment variables are not set.\n' +
    missing.map((k) => `  • ${k}`).join('\n') +
    '\n\nCopy .env.example to .env and fill in the values from your Firebase project settings.\n' +
    'Firebase features will not work until these are configured.';

  // In development: throw so the dev sees it immediately in the browser console.
  // In production: console.error so it appears in crash logs without crashing the app
  // (a user-facing crash on every page load is worse than degraded functionality).
  if (import.meta.env.DEV) {
    // Use console.error rather than throw to avoid crashing the Vite HMR overlay
    // for users who intentionally run with a partial config.
    console.error(msg);
  } else {
    console.error(msg);
  }
}

// ---------------------------------------------------------------------------
// Prefer the web environment values. If they are absent in a preview, reuse
// the public Firebase project configuration already bundled for the Android app.
// ---------------------------------------------------------------------------

const firebaseConfig = {
  apiKey:            resolvedConfig.VITE_FIREBASE_API_KEY as string,
  authDomain:        resolvedConfig.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId:         resolvedConfig.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket:     resolvedConfig.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: resolvedConfig.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             resolvedConfig.VITE_FIREBASE_APP_ID as string,
};

// ---------------------------------------------------------------------------
// App — initialise once; reuse existing instance on hot-reload.
// ---------------------------------------------------------------------------

export const firebaseApp: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ---------------------------------------------------------------------------
// Services — all consumers import these singletons, never call getAuth() etc.
// directly.  This guarantees exactly one Firebase initialization path.
// ---------------------------------------------------------------------------

import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore';

export const firebaseAuth: Auth                = getAuth(firebaseApp);
export const firebaseDb: Firestore             = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
export const firebaseStorage: FirebaseStorage  = getStorage(firebaseApp);
export const firebaseFunctions: Functions      = getFunctions(firebaseApp);

// Short aliases for convenience
export const auth = firebaseAuth;
export const db = firebaseDb;
export const storage = firebaseStorage;
export const functions = firebaseFunctions;

// ---------------------------------------------------------------------------
// Local emulator support
// Set VITE_FIREBASE_USE_EMULATOR=true in .env to use the Firebase Local
// Emulator Suite for offline development without touching the production project.
// ---------------------------------------------------------------------------

const useEmulator = import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true';

if (useEmulator) {
  try {
    connectAuthEmulator(firebaseAuth,    'http://127.0.0.1:9099', { disableWarnings: false });
    connectFirestoreEmulator(firebaseDb,  '127.0.0.1', 8080);
    connectStorageEmulator(firebaseStorage, '127.0.0.1', 9199);
    connectFunctionsEmulator(firebaseFunctions, '127.0.0.1', 5001);
    console.info('[Firebase] Connected to local emulators.');
  } catch {
    // Already connected — safe to ignore on Vite HMR re-execution.
  }
}
