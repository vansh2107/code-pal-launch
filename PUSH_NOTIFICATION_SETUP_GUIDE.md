# 🔥 Push Notification Setup Guide

## Complete Firebase FCM + OneSignal Integration

Your app now has full push notification support using both Firebase Cloud Messaging (FCM) and OneSignal. This guide explains what was implemented and what you need to do.

---

## 📋 What Was Implemented

### ✅ 1. Database Schema
- Created `notification_tokens` table to store FCM and OneSignal tokens
- Added RLS policies for security
- Automatic timestamp updates

### ✅ 2. Backend (Supabase Edge Functions)
- **New Function**: `update-notification-token` - Registers user tokens
- **Updated Functions**: All reminder functions now use unified notifications
  - `test-push-notification`
  - `task-two-hour-reminder`
  - `task-incomplete-reminder`
  - `timezone-notification-scheduler`
  - `document-reminder-scheduler`

### ✅ 3. Unified Notification System
- Automatically detects and uses available providers (FCM/OneSignal)
- Falls back gracefully if one provider fails
- Removes invalid tokens automatically

### ✅ 4. Frontend Integration
- New utility file: `src/utils/notifications.ts`
- Automatic token registration on app startup
- Permission request handling
- Test notification support

### ✅ 5. Android Native Code
- **FCM Integration**:
  - `MainMessagingService.kt` - Handles FCM messages
  - Notification channel creation
  - Token registration with backend
  
- **OneSignal Integration**:
  - `MainActivity.kt` - OneSignal initialization
  - Player ID registration
  - Push prompt handling

- **Build Configuration**:
  - `android/build.gradle` - Google services classpath
  - `android/app/build.gradle` - Firebase & OneSignal dependencies
  - `AndroidManifest.xml` - Permissions and services

---

## 🔧 What You Need To Do

### 1. **Upload Firebase Configuration File**

📍 **Location**: `android/app/google-services.json`

#### Steps:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project or create a new one
3. Go to **Project Settings** → **General**
4. Under "Your apps", add an Android app or select existing
   - **Package name**: `com.vansh.remonkreminder`
5. Download the `google-services.json` file
6. **Replace** the placeholder file at `android/app/google-services.json` with your downloaded file

---

### 2. **Configure OneSignal App ID**

You need to add your OneSignal App ID in **TWO** places:

#### A. Android Manifest
📍 **File**: `android/app/src/main/AndroidManifest.xml`

Replace:
```xml
<meta-data 
    android:name="onesignal_app_id" 
    android:value="ONESIGNAL-APP-ID-HERE" />
```

With your actual OneSignal App ID:
```xml
<meta-data 
    android:name="onesignal_app_id" 
    android:value="12345678-1234-1234-1234-123456789012" />
```

#### B. MainActivity
📍 **File**: `android/app/src/main/java/com/vansh/remonkreminder/MainActivity.kt`

Replace line 14:
```kotlin
private const val ONESIGNAL_APP_ID = "ONESIGNAL-APP-ID-HERE"
```

With:
```kotlin
private const val ONESIGNAL_APP_ID = "12345678-1234-1234-1234-123456789012"
```

---

### 3. **Add Supabase Secrets**

You need to add these secrets to your Supabase project:

#### A. Firebase Server Key
```bash
# In Supabase Dashboard → Settings → Edge Functions → Secrets
FIREBASE_SERVER_KEY=your-firebase-server-key-here
```

Get this from: Firebase Console → Project Settings → Cloud Messaging → Server Key

#### B. OneSignal REST API Key
```bash
# Already configured (verify it's correct)
ONESIGNAL_APP_ID=your-onesignal-app-id
ONESIGNAL_REST_API_KEY=your-onesignal-rest-api-key
```

Get these from: OneSignal Dashboard → Settings → Keys & IDs

---

### 4. **Build and Test**

#### Build APK:
```bash
# 1. Export to GitHub (use the "Export to Github" button in Lovable)
# 2. Clone your repository
git clone <your-repo-url>
cd <your-repo>

# 3. Install dependencies
npm install

# 4. Add Android platform (if not done yet)
npx cap add android

# 5. Sync Capacitor
npx cap sync

# 6. Build the project
npm run build

# 7. Open in Android Studio
npx cap open android

# 8. Build APK in Android Studio:
# Build → Build Bundle(s) / APK(s) → Build APK(s)
```

#### Test Notifications:
1. Install the APK on your device
2. Open the app and grant notification permissions
3. Go to Profile → Test Push Notification
4. You should receive a test notification!

---

## 📱 How It Works

### Token Registration Flow:
1. **App Starts** → Requests notification permission
2. **FCM/OneSignal** → Generates device token/player ID
3. **Native Code** → Sends token to Supabase endpoint
4. **Backend** → Stores token in `notification_tokens` table
5. **Ready** → User can now receive push notifications

### Notification Delivery Flow:
1. **Cron Job** → Triggers reminder function (e.g., document expiry)
2. **Function** → Fetches user's notification tokens
3. **Unified System** → Detects provider (FCM/OneSignal)
4. **Sends** → Push notification via appropriate provider
5. **Delivered** → User receives notification on device

---

## 🎯 Notification Features

Your app now supports:

✅ **Document Expiry Reminders**
- At user's preferred notification time
- Respects timezone settings

✅ **Task Reminders**
- Start time notifications
- 2-hour recurring reminders
- Incomplete task alerts
- 3-day overdue "funny" alerts

✅ **Daily Summaries**
- Morning overview of documents and tasks
- Timezone-aware delivery

✅ **Test Notifications**
- Built-in test page to verify setup

---

## 🔍 Troubleshooting

### No notifications received?

1. **Check permissions**: Settings → Apps → Remonk Reminder → Notifications (enabled?)
2. **Check profile settings**: In app → Profile → Enable push notifications
3. **Check logs**: Supabase Dashboard → Edge Functions → Logs
4. **Check tokens**: Database → `notification_tokens` table (any rows for your user?)

### Build errors?

1. **Google services plugin**: Make sure `google-services.json` is valid
2. **Dependencies**: Run `npx cap sync` after any changes
3. **Clean build**: Android Studio → Build → Clean Project

### Notifications work but wrong time?

1. **Check timezone**: Profile → Settings → Timezone (correct?)
2. **Check preferred time**: Profile → Settings → Notification Time
3. **Check cron jobs**: Supabase Dashboard → Database → pg_cron

---

## 📚 Additional Resources

- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [OneSignal Android Setup](https://documentation.onesignal.com/docs/android-sdk-setup)
- [Capacitor Push Notifications](https://capacitorjs.com/docs/guides/push-notifications-firebase)

---

## 🎉 You're All Set!

Once you complete the configuration steps above, your app will have a fully functional push notification system that works with both Firebase and OneSignal! 🚀

Any issues? Check the edge function logs in your Supabase dashboard for detailed debugging information.
