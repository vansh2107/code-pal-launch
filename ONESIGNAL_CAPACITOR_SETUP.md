# OneSignal + Capacitor Setup Guide

## ✅ What's Implemented

Your app now has **OneSignal push notifications** fully configured for **Capacitor Android**.

### Key Features:
- ✅ OneSignal SDK properly initialized for Capacitor
- ✅ Automatic permission request on app launch
- ✅ Player ID tracking and storage
- ✅ Test notification button on Dashboard
- ✅ Works with both Capacitor native and Despia native

## 🔧 Configuration

### OneSignal App ID
```
8cced195-0fd2-487f-9f10-2a8bc898ff4e
```

This is configured in:
- `src/App.tsx` (line 68)
- `android/app/src/main/AndroidManifest.xml` (line 24)

### Android Manifest Permissions
The following permissions are already configured in `AndroidManifest.xml`:
- `android.permission.POST_NOTIFICATIONS` (for Android 13+)
- `android.permission.INTERNET`

## 📱 How It Works

### On App Launch:
1. **App.tsx** initializes OneSignal when running on native platform
2. Checks if device is ready
3. Sets OneSignal App ID
4. **Prompts user for notification permission**
5. Gets and stores Player ID in localStorage
6. Sets up notification handlers

### When Testing Notification:
1. User clicks "Test Push Notification" button on Dashboard
2. Calls `sendTestNotification()` from `src/utils/notifications.ts`
3. Gets current user ID and OneSignal Player ID
4. Invokes `test-push-notification` Supabase function
5. Backend sends notification via OneSignal

## 🔍 Debugging

### Check OneSignal Player ID:
Open browser console (Chrome DevTools) and look for:
```
OneSignal Player ID: [your-player-id]
```

Or check localStorage:
```javascript
localStorage.getItem('onesignal_player_id')
```

### Check Permission Status:
Look for in console:
```
OneSignal notification permission: Granted
```

### Common Issues:

**1. Permission Dialog Not Appearing**
- Make sure you're running on a real device or emulator (not browser)
- Check that `POST_NOTIFICATIONS` permission is in AndroidManifest.xml
- Try uninstalling and reinstalling the app

**2. No Player ID**
- Wait a few seconds after app launch
- Check console logs for errors
- Verify OneSignal App ID is correct

**3. Test Notification Not Received**
- Make sure permission is granted
- Check that Player ID exists in console logs
- Verify you're logged in
- Check backend logs in Supabase Edge Function logs

## 🚀 Build & Deploy

After git pull, run:
```bash
npm install
npx cap sync
npx cap open android
```

Then build and run in Android Studio.

## 📝 Backend Requirements

Make sure your `test-push-notification` Supabase Edge Function:
1. Queries `onesignal_player_ids` table for the user
2. Sends notification via OneSignal API
3. Uses your OneSignal REST API Key (stored in Supabase secrets)

## 🎯 Testing Steps

1. **Build & Install App** on Android device/emulator
2. **Login** to your account
3. **Grant permission** when prompted
4. **Check console** for Player ID
5. **Go to Dashboard**
6. **Tap "Test Push Notification"** button
7. **Wait 3-5 seconds** for notification to arrive

## 🔐 Required Secrets in Supabase

Make sure these are set in Supabase Project Settings → Edge Functions → Secrets:
- `ONESIGNAL_APP_ID`: 8cced195-0fd2-487f-9f10-2a8bc898ff4e
- `ONESIGNAL_REST_API_KEY`: Your OneSignal REST API Key

## ✨ Success Indicators

You'll know it's working when:
- ✅ Permission dialog appears on first launch
- ✅ Console shows "OneSignal initialized successfully"
- ✅ Console shows your Player ID
- ✅ Test notification button shows success toast
- ✅ Notification appears in device notification tray
