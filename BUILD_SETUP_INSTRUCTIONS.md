# 🚀 Capacitor & OneSignal Build Setup Instructions

## ✅ COMPLETED AUTOMATICALLY

The following files have been created/updated:

### 1. ✅ Capacitor Configuration
- **File**: `capacitor.config.ts`
- **Status**: Created with correct appId and webDir

### 2. ✅ Android Manifest
- **File**: `android/app/src/main/AndroidManifest.xml`
- **Status**: Created with OneSignal metadata placeholders

### 3. ✅ Firebase Placeholder
- **File**: `android/app/google-services.json`
- **Status**: Created as placeholder (requires replacement)

### 4. ✅ OneSignal Code
- **File**: `src/main.tsx`
- **Status**: OneSignal initialization code added (commented out until package installed)

### 5. ✅ Package.json
- **Status**: Already clean, no merge conflicts found
- **Scripts**: All required scripts present (dev, build, preview, build:dev)

### 6. ✅ Vite Config
- **Status**: Already compatible with Capacitor
- **Output**: Correctly set to "dist"

### 7. ✅ TypeScript Config
- **Status**: Valid JSON, no formatting errors

---

## ⚠️ MANUAL STEPS REQUIRED

### Step 1: Install Capacitor Dependencies
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
```

### Step 2: Install OneSignal
```bash
npm install onesignal-cordova-plugin
```

### Step 3: Initialize Capacitor (if not already done)
```bash
npx cap init
```

### Step 4: Add Android Platform
```bash
npx cap add android
```

### Step 5: Replace Firebase Configuration
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create or select your project
3. Add an Android app with package name: `com.vansh.remonkreminder`
4. Download `google-services.json`
5. Replace `android/app/google-services.json` with the downloaded file

### Step 6: Configure OneSignal
1. Go to [OneSignal Dashboard](https://onesignal.com/)
2. Create or select your app
3. Get your OneSignal App ID
4. Update the following files:
   - In `src/main.tsx`: Replace `"ONESIGNAL-APP-ID-HERE"` with your actual App ID
   - In `android/app/src/main/AndroidManifest.xml`: Replace `"ONESIGNAL-APP-ID-HERE"` with your actual App ID
5. Uncomment the OneSignal initialization code in `src/main.tsx`

### Step 7: Build the App
```bash
npm run build
```

### Step 8: Sync with Capacitor
```bash
npx cap sync android
```

### Step 9: Open in Android Studio
```bash
npx cap open android
```

### Step 10: Run on Device/Emulator
From Android Studio:
- Click "Run" button
- Or use: `npx cap run android`

---

## 📋 CHECKLIST

- [ ] Installed Capacitor dependencies
- [ ] Installed OneSignal plugin
- [ ] Added Android platform
- [ ] Replaced google-services.json with real file
- [ ] Updated OneSignal App ID in src/main.tsx
- [ ] Updated OneSignal App ID in AndroidManifest.xml
- [ ] Uncommented OneSignal code in src/main.tsx
- [ ] Built the app (npm run build)
- [ ] Synced with Capacitor (npx cap sync android)
- [ ] Tested on device/emulator

---

## 🐛 TROUBLESHOOTING

### Build fails with TypeScript errors
- Ensure all dependencies are installed
- Run `npm install` again
- Clear node_modules and reinstall

### OneSignal not working
- Verify App ID is correct in both files
- Check that google-services.json is the real file, not placeholder
- Ensure POST_NOTIFICATIONS permission is granted

### Capacitor sync fails
- Run `npm run build` first
- Check that dist folder exists
- Verify capacitor.config.ts is correct

---

## 📚 DOCUMENTATION LINKS

- [Capacitor Docs](https://capacitorjs.com/docs)
- [OneSignal Cordova Setup](https://documentation.onesignal.com/docs/cordova-sdk-setup)
- [Firebase Console](https://console.firebase.google.com/)
- [OneSignal Dashboard](https://onesignal.com/)
