import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// OneSignal Initialization for Capacitor
// INSTALLATION REQUIRED: npm install onesignal-cordova-plugin
// UNCOMMENT THE CODE BELOW AFTER INSTALLING ONESIGNAL:
/*
if (typeof window !== 'undefined' && (window as any).cordova) {
  document.addEventListener("deviceready", () => {
    import('onesignal-cordova-plugin').then((OneSignal) => {
      OneSignal.default.setAppId("ONESIGNAL-APP-ID-HERE");
      OneSignal.default.promptForPushNotificationsWithUserResponse((accepted: boolean) => {
        console.log("User accepted push notifications:", accepted);
      });
    }).catch((error) => {
      console.error("OneSignal initialization error:", error);
    });
  }, false);
}
*/

createRoot(document.getElementById("root")!).render(<App />);
