import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { lazy, Suspense, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { speakWelcome } from "@/utils/voiceGreeting";

import AuthEventListener from "./components/auth/AuthEventListener";
import { OfflineIndicator } from "./components/layout/OfflineIndicator";

// ── Only eagerly load the landing page (Dashboard) ──
import Dashboard from "./pages/Dashboard";

// ── Lazy-load everything else ──
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Documents = lazy(() => import("./pages/Documents"));
const DocumentDetail = lazy(() => import("./pages/DocumentDetail"));
const EditDocument = lazy(() => import("./pages/EditDocument"));
const Scan = lazy(() => import("./pages/Scan"));
const Notifications = lazy(() => import("./pages/Notifications"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const Profile = lazy(() => import("./pages/Profile"));
const DocVault = lazy(() => import("./pages/DocVault"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Teams = lazy(() => import("./pages/Teams"));
const TestEmails = lazy(() => import("./pages/TestEmails"));
const TestOneSignal = lazy(() => import("./pages/TestOneSignal"));
const Tasks = lazy(() => import("./pages/Tasks"));
const AddTask = lazy(() => import("./pages/AddTask"));
const EditTask = lazy(() => import("./pages/EditTask"));
const TaskHistory = lazy(() => import("./pages/TaskHistory"));
const TaskDetail = lazy(() => import("./pages/TaskDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const NotificationSoundSettings = lazy(() => import("./pages/NotificationSoundSettings"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));

// Lazy-load heavy components that aren't needed at startup
const ChatBot = lazy(() => import("./components/chatbot/ChatBot").then(m => ({ default: m.ChatBot })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ── Minimal loading fallback ──
const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

// ── Background initializer: defers non-critical work ──
const BackgroundInitializer = () => {
  useEffect(() => {
    // Play voice greeting on first visit
    speakWelcome();

    // Defer all non-critical initialization to after first paint
    const timeoutId = requestIdleCallback(
      () => {
        initializeBackground();
      },
      { timeout: 3000 }
    );

    return () => cancelIdleCallback(timeoutId);
  }, []);

  return null;
};

async function initializeBackground() {
  try {
    if (Capacitor.isNativePlatform()) {
      // Initialize StatusBar
      const { initializeStatusBar } = await import("@/lib/statusbar");
      await initializeStatusBar();

      // Initialize OneSignal
      const { initOneSignal } = await import("@/lib/onesignal");
      initOneSignal();

      // Request permissions (non-blocking)
      const { Camera } = await import("@capacitor/camera");
      const { PushNotifications } = await import("@capacitor/push-notifications");
      
      Promise.allSettled([
        Camera.checkPermissions().then(p => {
          if (p.camera === 'prompt' || p.camera === 'prompt-with-rationale') {
            return Camera.requestPermissions({ permissions: ['camera'] });
          }
        }),
        PushNotifications.checkPermissions().then(p => {
          if (p.receive === 'prompt' || p.receive === 'prompt-with-rationale') {
            return PushNotifications.requestPermissions();
          }
        }),
      ]);

      // Listen for app resume to refresh data
      const { App: CapacitorApp } = await import("@capacitor/app");
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['documents'] });
        }
      });
    }

    // Initialize back button handler for native
    if (Capacitor.isNativePlatform()) {
      const { App: CapacitorApp } = await import("@capacitor/app");
      // Back button is handled via the hook, but app listener for exit
    }
    // Pull latest data into IndexedDB for offline access
    if (navigator.onLine) {
      try {
        const { fullSync, registerAutoSync } = await import("@/utils/syncEngine");
        registerAutoSync();
        await fullSync();
      } catch (e) {
        console.warn("Offline sync pull skipped:", e);
      }
    } else {
      // Offline at startup: still register auto-sync so queue flushes when back online
      try {
        const { registerAutoSync } = await import("@/utils/syncEngine");
        registerAutoSync();
      } catch { /* noop */ }
    }
  } catch (error) {
    console.error("Background initialization error:", error);
  }
}

// requestIdleCallback polyfill
if (typeof window !== 'undefined' && !('requestIdleCallback' in window)) {
  (window as any).requestIdleCallback = (cb: Function, opts?: { timeout: number }) => {
    return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), opts?.timeout || 1);
  };
  (window as any).cancelIdleCallback = (id: number) => clearTimeout(id);
}

// ── Performance logging ──
if (typeof window !== 'undefined') {
  performance.mark('app-init-start');
}

// ── MAIN APP ──
const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />

          <BrowserRouter>
            <AuthEventListener />
            <BackgroundInitializer />
            <OfflineIndicator />

            {/* ChatBot loaded lazily after main content */}
            <Suspense fallback={null}>
              <ChatBot />
            </Suspense>

            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
                <Route path="/documents/:id" element={<ProtectedRoute><DocumentDetail /></ProtectedRoute>} />
                <Route path="/documents/:id/edit" element={<ProtectedRoute><EditDocument /></ProtectedRoute>} />
                <Route path="/scan" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/notification-settings" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />
                <Route path="/notification-sound-settings" element={<ProtectedRoute><NotificationSoundSettings /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/docvault" element={<ProtectedRoute><DocVault /></ProtectedRoute>} />
                <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
                <Route path="/task-history" element={<ProtectedRoute><TaskHistory /></ProtectedRoute>} />
                <Route path="/add-task" element={<ProtectedRoute><AddTask /></ProtectedRoute>} />
                <Route path="/task/:id" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
                <Route path="/edit-task/:id" element={<ProtectedRoute><EditTask /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/test-emails" element={<ProtectedRoute><TestEmails /></ProtectedRoute>} />
                <Route path="/test-onesignal" element={<ProtectedRoute><TestOneSignal /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
