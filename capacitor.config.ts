/**
 * capacitor.config.ts
 *
 * Capacitor configuration for Remonk Reminder.
 *
 * This file is executed by the Capacitor CLI (not by Vite), so Vite's
 * import.meta.env is unavailable.  We load .env via dotenv so that the
 * OneSignal App ID (and any other Capacitor-level config) comes from
 * the same single source of truth as the rest of the project.
 *
 * If dotenv is not available or .env is missing, the ONESIGNAL_APP_ID
 * falls back to the process.env value (set by CI/CD pipelines) and
 * then to an empty string — Capacitor will log a warning but still
 * build.  This prevents a hard crash if someone runs `npx cap sync`
 * without a .env file present.
 */

import { CapacitorConfig } from '@capacitor/cli';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Load .env manually — dotenv may not be available in Capacitor's Node context
// ---------------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key   = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    result[key] = value;
  }
  return result;
}

const env = loadEnv();

// VITE_ONESIGNAL_APP_ID is the canonical key (same as used in the web bundle).
// Fall back to process.env for CI environments that inject it directly.
const oneSignalAppId: string =
  env['VITE_ONESIGNAL_APP_ID'] ??
  process.env['VITE_ONESIGNAL_APP_ID'] ??
  '';

if (!oneSignalAppId) {
  console.warn(
    '[capacitor.config] VITE_ONESIGNAL_APP_ID is not set in .env. ' +
    'OneSignal push notifications will not work on this build.'
  );
}

// ---------------------------------------------------------------------------
// Capacitor configuration
// ---------------------------------------------------------------------------
const config: CapacitorConfig = {
  appId:  'com.vansh.remonkreminder',
  appName: 'Remonk Reminder',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    OneSignal: {
      appId: oneSignalAppId,
    },
    SplashScreen: {
      launchAutoHide:             false,
      backgroundColor:            '#000000',
      androidSplashResourceName:  'splash',
      androidScaleType:           'CENTER_CROP',
      showSpinner:                false,
      splashFullScreen:           true,
      splashImmersive:            true,
    },
  },
};

export default config;
