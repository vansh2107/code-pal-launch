# 🚀 Native Mobile App with Push Notifications Setup

## ✅ WHAT'S BEEN DONE

Your entire project has been upgraded with **full native mobile support** and **dual push notification system** (Firebase FCM + OneSignal).

### 1. Database Changes
✅ Created `notification_tokens` table to store FCM and OneSignal tokens
✅ Configured Row Level Security (RLS) policies
✅ Added indexes for optimal performance

### 2. Backend Changes
✅ Created new edge function: `update-notification-token`
✅ Updated all push notification edge functions:
  - `task-two-hour-reminder`
  - `task-incomplete-reminder`
  - `document-reminder`
  - `test-push-notification`
✅ Created unified push notification utility (`_shared/pushNotifications.ts`)
✅ All edge functions now support both FCM and OneSignal automatically

### 3. Frontend Changes
✅ Created `src/utils/notifications.ts` with helper functions:
  - `requestNotificationPermission()`
  - `getFCMToken()`
  - `getOneSignalPlayerId()`
  - `registerTokenWithBackend()`
  - `initializePushNotifications()`
  - `refreshNotificationTokens()`

### 4. Android Native Files Created
✅ `android/build.gradle` - Root build configuration
✅ `android/app/build.gradle` - App build configuration with Firebase & OneSignal
✅ `android/app/src/main/java/com/vansh/remonkreminder/MainActivity.java` - OneSignal initialization
✅ `android/app/src/main/java/com/vansh/remonkreminder/FirebaseMessagingService.java` - FCM service
✅ Updated `android/app/src/main/AndroidManifest.xml` - All permissions and services

---

## ⚠️ MANUAL STEPS REQUIRED

### STEP 1: Configure Firebase (FCM)

1. **Go to Firebase Console**: https://console.firebase.google.com/
2. **Create or select your project**
3. **Add an Android app**:
   - Package name: `com.vansh.remonkreminder`
   - App nickname: `Remonk Reminder`
4. **Download `google-services.json`**
5. **Replace the placeholder file**:
   ```
   android/app/google-services.json
   ```
   👉 Replace the entire placeholder file with your downloaded file

6. **Get your Firebase Server Key**:
   - Go to Project Settings > Cloud Messaging
   - Copy the "Server Key"
   - Add it as a Supabase secret named `FIREBASE_SERVER_KEY`:
     ```
     Go to: https://supabase.com/dashboard/project/rndunloczfpfbubuwffb/settings/functions
     Click "Add secret"
     Name: FIREBASE_SERVER_KEY
     Value: [paste your server key]
     ```

### STEP 2: Configure OneSignal

1. **Go to OneSignal Dashboard**: https://onesignal.com/
2. **Create or select your app**
3. **Get your credentials**:
   - OneSignal App ID
   - REST API Key

4. **Update the following files**:

   **File 1**: `android/app/src/main/java/com/vansh/remonkreminder/MainActivity.java`
   ```java
   // Line 18 - Replace:
   OneSignal.setAppId("ONESIGNAL-APP-ID-HERE");
   // With your actual App ID:
   OneSignal.setAppId("your-actual-app-id");
   ```

   **File 2**: `android/app/src/main/AndroidManifest.xml`
   ```xml
   <!-- Line 37 - Replace: -->
   android:value="ONESIGNAL-APP-ID-HERE"
   <!-- With your actual App ID: -->
   android:value="your-actual-app-id"
   ```

5. **Update Supabase secrets** (if not already set):
   ```
   Go to: https://supabase.com/dashboard/project/rndunloczfpfbubuwffb/settings/functions
   
   Verify these secrets exist:
   - ONESIGNAL_APP_ID (your App ID)
   - ONESIGNAL_REST_API_KEY (your REST API Key)
   ```

### STEP 3: Install Required Dependencies

```bash
# Capacitor dependencies (if not already installed)
npm install @capacitor/core @capacitor/cli @capacitor/android

# OneSignal
npm install onesignal-cordova-plugin
```

### STEP 4: Initialize Frontend Notification System

Add this code to your app's main authentication flow (e.g., after login):

```typescript
import { initializePushNotifications } from '@/utils/notifications';

// Call this after user successfully logs in
await initializePushNotifications();
```

**Recommended locations**:
- `src/pages/Auth.tsx` - After successful login
- `src/App.tsx` - On app mount (if user is already logged in)
- `src/hooks/useAuth.tsx` - Inside the auth hook

### STEP 5: Build and Deploy

```bash
# Build the web app
npm run build

# Sync with Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android

# In Android Studio:
# 1. Let Gradle sync complete
# 2. Connect device or start emulator
# 3. Click Run (green play button)
```

---

## 📋 TESTING CHECKLIST

### Test Push Notifications

1. **Test via Supabase Function**:
   ```bash
   curl -X POST https://rndunloczfpfbubuwffb.supabase.co/functions/v1/test-push-notification \
     -H "Authorization: Bearer YOUR_USER_JWT" \
     -H "Content-Type: application/json" \
     -d '{
       "title": "Test Notification",
       "message": "Testing FCM + OneSignal"
     }'
   ```

2. **Check Logs**:
   - Supabase Edge Functions logs: https://supabase.com/dashboard/project/rndunloczfpfbubuwffb/functions/update-notification-token/logs
   - Android Logcat in Android Studio

3. **Verify Token Registration**:
   ```sql
   -- Run in Supabase SQL Editor
   SELECT * FROM notification_tokens WHERE user_id = 'your-user-id';
   ```

### Test Document Expiry Notifications
- Create a document with expiry date = tomorrow
- Wait for your preferred notification time (18:00 IST)
- Check if notification arrives

### Test Task Reminders
- Create a task for today
- Wait for start time
- Check if notification arrives
- Check if 2-hour reminders work

---

## 🔧 TROUBLESHOOTING

### FCM not working?
1. Verify `google-services.json` is the real file (not placeholder)
2. Check `FIREBASE_SERVER_KEY` is set in Supabase secrets
3. Check Android Logcat for FCM token registration
4. Ensure app has notification permission

### OneSignal not working?
1. Verify App ID is correct in both files
2. Check `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` in Supabase
3. Check OneSignal dashboard for player registration
4. Ensure app has notification permission

### No notifications received?
1. Check user profile: `push_notifications_enabled = true`
2. Check if tokens are registered in `notification_tokens` table
3. Check edge function logs for errors
4. Test with `test-push-notification` function first

### Build errors?
1. Clean and rebuild:
   ```bash
   cd android
   ./gradlew clean
   cd ..
   npx cap sync android
   ```
2. Check that all dependencies are in `android/app/build.gradle`
3. Verify Google Services plugin is applied

---

## 📱 EXPORT APK

### Debug APK (for testing)
```bash
cd android
./gradlew assembleDebug
# APK location: android/app/build/outputs/apk/debug/app-debug.apk
```

### Release APK (for production)
1. Create a keystore:
   ```bash
   keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
   ```

2. Update `android/app/build.gradle`:
   ```gradle
   android {
       ...
       signingConfigs {
           release {
               storeFile file('my-release-key.jks')
               storePassword 'your-password'
               keyAlias 'my-key-alias'
               keyPassword 'your-password'
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
               ...
           }
       }
   }
   ```

3. Build release APK:
   ```bash
   cd android
   ./gradlew assembleRelease
   # APK location: android/app/build/outputs/apk/release/app-release.apk
   ```

---

## 🎯 HOW IT WORKS

1. **User logs in** → Frontend calls `initializePushNotifications()`
2. **System tries to get FCM token** → If available, registers with backend
3. **If FCM not available** → Falls back to OneSignal
4. **Token stored in database** → `notification_tokens` table
5. **When notification needed** → Backend edge functions:
   - Query `notification_tokens` for user
   - Detect provider (FCM or OneSignal)
   - Send notification via appropriate provider
   - Works automatically with both providers

---

## 📞 SUPPORT

If you encounter issues:
1. Check Android Logcat for native errors
2. Check Supabase Edge Function logs for backend errors
3. Check browser console for frontend errors
4. Verify all secrets are correctly set in Supabase

---

**Your app now has complete native mobile support with push notifications! 🎉**
