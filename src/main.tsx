import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── Service Worker registration (production only, not in iframes/preview) ──
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com") ||
    window.location.hostname.includes("lovable.app"));

if (isPreviewHost || isInIframe) {
  // Clean up any prior SW registrations in preview/iframe contexts
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }
} else if (import.meta.env.PROD) {
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      /* PWA registration is optional */
    });
}

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
