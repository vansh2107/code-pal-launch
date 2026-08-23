# Repair the complete push notification pipeline

## Implementation
- Fix Edge Function CORS for Capacitor origins so native POST requests reach Supabase instead of stopping after preflight.
- Consolidate Android registration around the OneSignal Cordova SDK, link each signed-in user with OneSignal External ID, persist subscription IDs through the authenticated backend, refresh on subscription changes/app resume, and unlink on sign-out.
- Consolidate backend delivery into one OneSignal helper used by tests, document reminders, task reminders/overdue alerts, routines, and schedulers; retain stored subscription targeting for previously registered devices.
- Improve test-notification diagnostics so permission, registration, target, credentials, and provider failures are distinguishable.
- Remove conflicting direct FCM/native OneSignal initialization paths that can compete with the Cordova SDK.

## Backend and validation
- Update Edge Function JWT configuration so protected functions validate the user inside the function and work with the current Supabase signing-key setup.
- Deploy the affected functions, test registration/test delivery, inspect fresh logs, and verify the frontend build.

## Technical details
- OneSignal remains the single push provider; it uses FCM/APNs internally.
- Existing token rows remain supported, while new and returning devices are linked to the authenticated user and upserted idempotently.
- Notification preferences continue to gate scheduled reminders; the explicit test notification bypasses preference gating.
