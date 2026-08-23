import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initPdfWorker } from './services/document-processor/pdf-init';
initPdfWorker();

import "./index.css";
import "./responsive.css";


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


createRoot(document.getElementById("root")!).render(<App />);

// Hide Capacitor native splash once React has mounted the custom video splash.
if (typeof window !== "undefined") {
  requestAnimationFrame(() => {
    import("@capacitor/core")
      .then(({ Capacitor }) => {
        if (Capacitor.isNativePlatform()) {
          import("@capacitor/splash-screen")
            .then(({ SplashScreen }) =>
              SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {})
            )
            .catch(() => {});
        }
      })
      .catch(() => {});
  });
}
