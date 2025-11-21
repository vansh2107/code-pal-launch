# OneSignal Native Push Notifications Setup (Capacitor + Android)

## ✅ What's Implemented

Your app now has **full native OneSignal push notification support** using Capacitor + Android Studio.

### Key Features:
- ✅ OneSignal SDK v5 properly initialized
- ✅ Automatic Player ID registration on user login
- ✅ User email linking to OneSignal
- ✅ Backend notification sending via REST API
- ✅ Works with native Android builds (NO Despia)

---

## 📦 Installation Steps

### 1. Install Required Packages
```bash
npm install onesignal-cordova-plugin
```

### 2. Sync with Capacitor
```bash
npx cap sync
npx cap update
```

---

## 🔧 Configuration

### OneSignal App ID
```
8cced195-0fd2-487f-9f10-2a8bc898ff4e
```

This is configured in:
- `capacitor.config.ts`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/.../ApplicationClass.java`
- `src/lib/onesignal.ts`

---

## 📱 How It Works

### On App Launch (Native Platform Only):
1. **App.tsx** checks if running on native platform
2. Calls `initOneSignal()` from `src/lib/onesignal.ts`
3. Waits for `deviceready` event (Cordova/Capacitor)
4. Initializes OneSignal SDK with App ID
5. Requests notification permission
6. Sets up notification click listeners

### When User Logs In:
1. **useAuth.tsx** detects authenticated user
2. Waits 2 seconds for OneSignal to fully initialize
3. Calls `savePlayerIdToSupabase()` to register device
4. Calls `setUserEmail()` to link user email to OneSignal
5. Player ID is stored in `onesignal_player_ids` table

### When Sending Notifications:
1. Backend fetches Player IDs from `onesignal_player_ids` table
2. Calls OneSignal REST API with Player IDs
3. OneSignal delivers push notification to device
4. User receives notification in system tray

---

## 🔐 Required Secrets in Supabase

Make sure these are set in **Supabase Project Settings → Edge Functions → Secrets**:

- `ONESIGNAL_APP_ID`: `8cced195-0fd2-487f-9f10-2a8bc898ff4e`
- `ONESIGNAL_REST_API_KEY`: Your OneSignal REST API Key

---

## 🛠️ Backend Usage

### Sending Push Notifications from Edge Functions

```typescript
import { sendOneSignalNotification } from '../_shared/onesignal.ts';

// Inside your edge function
const success = await sendOneSignalNotification(supabase, {
  userId: 'user-uuid-here',
  title: 'Task Reminder',
  message: 'Your task is starting now!',
  data: {
    taskId: 'task-123',
    type: 'task_reminder'
  }
});
```

The helper automatically:
- Fetches all Player IDs for the user
- Sends notification to all registered devices
- Handles errors gracefully
- Returns success/failure status

---

## 🚀 Build & Deploy

### For Android:
```bash
# 1. Ensure all changes are committed
git pull

# 2. Install dependencies
npm install

# 3. Build web assets
npm run build

# 4. Sync with native project
npx cap sync

# 5. Open in Android Studio
npx cap open android
```

### In Android Studio:
1. Wait for Gradle sync to complete
2. Build → Build APK or Build Bundle
3. Install on device/emulator
4. Test notifications!

---

## 🧪 Testing Notifications

### From Dashboard:
1. Login to the app on a physical device or emulator
2. Wait for OneSignal to initialize (check console logs)
3. Go to Dashboard
4. Tap **"Test Push Notification"** button
5. Notification should appear within 3-5 seconds

### Manual Testing via Supabase:
```sql
-- Check registered Player IDs
SELECT * FROM onesignal_player_ids;

-- Then call edge function manually
```

---

## 🔍 Debugging

### Check OneSignal Initialization:
Look for these console logs:
```
Initializing OneSignal for Capacitor Native...
Initializing OneSignal...
OneSignal initialized successfully
```

### Check Player ID Registration:
```
OneSignal Player ID: [your-player-id]
Player ID saved to Supabase
```

### Common Issues:

**1. No Permission Dialog**
- Make sure you're on a physical device or emulator (not browser)
- Check `POST_NOTIFICATIONS` permission in AndroidManifest.xml
- Uninstall and reinstall the app

**2. Player ID Not Registered**
- Wait 2-3 seconds after login
- Check Supabase `onesignal_player_ids` table
- Check console logs for errors

**3. Notifications Not Received**
- Verify permission is granted
- Check OneSignal dashboard for delivery status
- Verify REST API Key is correct in Supabase secrets
- Check edge function logs for errors

**4. Build Errors**
- Run `npx cap sync` after code changes
- Clean build in Android Studio
- Check `google-services.json` is in `android/app/`

---

## 📋 Checklist

Before testing, ensure:
- ✅ `google-services.json` exists in `android/app/`
- ✅ OneSignal App ID matches in all config files
- ✅ Supabase secrets are set (App ID + REST API Key)
- ✅ App is built via Android Studio (not browser)
- ✅ User is logged in
- ✅ Notification permission is granted

---

## 🎯 Success Indicators

You'll know it's working when:
- ✅ Console shows "OneSignal initialized successfully"
- ✅ Console shows Player ID after login
- ✅ `onesignal_player_ids` table has your entry
- ✅ Test notification appears in device notification tray
- ✅ Clicking notification opens the app

---

## 📚 Additional Resources

- [OneSignal Android Setup](https://documentation.onesignal.com/docs/android-sdk-setup)
- [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications)
- [OneSignal REST API](https://documentation.onesignal.com/reference/create-notification)

---

## ⚠️ Important Notes

- **Native Only**: This setup works ONLY for native Android builds via Capacitor
- **No Web Push**: Browser-based testing will NOT work
- **Despia Not Required**: This implementation does NOT use Despia Native
- **FCM Required**: Make sure `google-services.json` is configured correctly
- **Production**: Remember to disable verbose logging in `ApplicationClass.java` before release
