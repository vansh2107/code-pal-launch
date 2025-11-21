import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vansh.remonkreminder',
  appName: 'Remonk Reminder',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    OneSignal: {
      appId: "8cced195-0fd2-487f-9f10-2a8bc898ff4e"
    }
  }
};

export default config;
