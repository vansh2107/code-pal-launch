# Repair the complete push notification pipeline

## Goal
Make OneSignal the single push-delivery path for every signed-in Android device, while preserving previously registered OneSignal subscription IDs and ensuring reminders, routines, tasks, overdue alerts, schedulers, and test pushes use the same reliable backend sender.

## Implementation
- Fix shared Edge Function CORS so Capacitor origins are accepted and every response, including errors and preflight responses, carries the required headers.
- Replace the competing native/Despia/FCM registration paths with one OneSignal Cordova lifecycle:
  - initialize once on native startup without waiting for a missed lifecycle event;
  - request/check permission through OneSignal;
  - link the signed-in account using OneSignal External ID;
  - wait for and persist the current subscription ID through the authenticated registration function;
  - refresh registration on subscription changes, login, and app resume;
  - unlink the OneSignal user on sign-out.
- Keep legacy `onesignal_player_ids` targets while upserting current devices into `notification_tokens` idempotently, so old and returning devices remain reachable.
- Consolidate server delivery into the shared OneSignal helper and route all test, document, task, routine, overdue, incomplete, and timezone scheduler pushes through it; remove direct FCM and nested function-invocation delivery paths.
- Return structured delivery diagnostics that distinguish missing permission, missing subscription, missing stored target, invalid credentials, OneSignal rejection, and successful delivery. Update the test UI/utility to display these outcomes accurately.
- Update Edge Function JWT settings for signing-key compatibility and keep explicit in-function authentication for protected registration and test endpoints.
- Remove duplicate Android SDK initialization and stale direct Capacitor/Despia registration code that can race with the Cordova OneSignal SDK.

## Backend validation
- Inspect current token/subscription rows and recent Edge Function logs before and after deployment.
- Deploy all affected Edge Functions.
- Test CORS preflight, unauthenticated rejection, authenticated registration/test requests where a preview session is available, and scheduled sender execution without bypassing preference checks.
- Verify the frontend build and confirm no remaining direct FCM delivery or duplicate native registration paths.

## Native follow-up
After pulling the updated project locally, run `npm install`, then `npx cap sync android`, rebuild, and launch the Android app so the native OneSignal plugin changes are included.
