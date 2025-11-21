import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import { useBackButton } from "@/hooks/useBackButton";
import { ChatBot } from "@/components/chatbot/ChatBot";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import OneSignal from "onesignal-cordova-plugin";

// PAGES
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Documents from "./pages/Documents";
import DocumentDetail from "./pages/DocumentDetail";
import EditDocument from "./pages/EditDocument";
import Scan from "./pages/Scan";
import Notifications from "./pages/Notifications";
import NotificationSettings from "./pages/NotificationSettings";
import Profile from "./pages/Profile";
import DocVault from "./pages/DocVault";
import NotFound from "./pages/NotFound";
import Teams from "./pages/Teams";
import TestEmails from "./pages/TestEmails";
import TestOneSignal from "./pages/TestOneSignal";
import Tasks from "./pages/Tasks";
import AddTask from "./pages/AddTask";
import EditTask from "./pages/EditTask";
import TaskHistory from "./pages/TaskHistory";
import TaskDetail from "./pages/TaskDetail";
import Settings from "./pages/Settings";
import AuthEventListener from "./components/auth/AuthEventListener";

const queryClient = new QueryClient();

// ---------------------------------------------------
// 🚀 OneSignal + Permissions + Back Button Handler
// ---------------------------------------------------
const NotificationScheduler = () => {
  const { requestAllPermissions } = usePermissions();
  useBackButton();

  useEffect(() => {
    const initialize = async () => {
      try {
        // Request notification + camera permissions
        await requestAllPermissions();

        // Initialize OneSignal for Capacitor Native
        if (Capacitor.isNativePlatform()) {
          console.log("Initializing OneSignal for Capacitor Native...");
          
          // Wait for platform ready
          await new Promise((resolve) => {
            if (document.readyState === 'complete') {
              resolve(true);
            } else {
              document.addEventListener('deviceready', () => resolve(true), { once: true });
              // Fallback timeout
              setTimeout(() => resolve(true), 1000);
            }
          });

          // Set OneSignal App ID
          (OneSignal as any).setAppId("8cced195-0fd2-487f-9f10-2a8bc898ff4e");
          console.log("OneSignal App ID set");

          // Prompt for notification permission
          (OneSignal as any).promptForPushNotificationsWithUserResponse((accepted: boolean) => {
            console.log("OneSignal notification permission:", accepted ? "Granted" : "Denied");
          });

          // Get the subscription ID (Player ID) and log it
          (OneSignal as any).getDeviceState((state: any) => {
            console.log("OneSignal Player ID:", state?.userId || "Not available yet");
            if (state?.userId) {
              // Store in local storage for test notification
              localStorage.setItem('onesignal_player_id', state.userId);
            }
          });

          // Handle notification received when app is in foreground
          (OneSignal as any).setNotificationWillShowInForegroundHandler((notificationReceivedEvent: any) => {
            console.log("Notification received in foreground:", notificationReceivedEvent);
            const notification = notificationReceivedEvent.getNotification();
            notificationReceivedEvent.complete(notification);
          });

          // Handle notification opened
          (OneSignal as any).setNotificationOpenedHandler((data: any) => {
            console.log("Notification opened:", JSON.stringify(data));
          });

          console.log("OneSignal initialized successfully");
        } else {
          console.log("Not a native platform, skipping OneSignal initialization");
        }
      } catch (error) {
        console.error("Error initializing OneSignal:", error);
      }
    };

    initialize();
  }, [requestAllPermissions]);

  return null;
};

// ---------------------------------------------------
// MAIN APP
// ---------------------------------------------------
const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />

          <BrowserRouter>
            <AuthEventListener />
            <NotificationScheduler />
            <ChatBot />

            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/documents"
                element={
                  <ProtectedRoute>
                    <Documents />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/documents/:id"
                element={
                  <ProtectedRoute>
                    <DocumentDetail />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/documents/:id/edit"
                element={
                  <ProtectedRoute>
                    <EditDocument />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/scan"
                element={
                  <ProtectedRoute>
                    <Scan />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <Notifications />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/notification-settings"
                element={
                  <ProtectedRoute>
                    <NotificationSettings />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/docvault"
                element={
                  <ProtectedRoute>
                    <DocVault />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/tasks"
                element={
                  <ProtectedRoute>
                    <Tasks />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/task-history"
                element={
                  <ProtectedRoute>
                    <TaskHistory />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/add-task"
                element={
                  <ProtectedRoute>
                    <AddTask />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/task/:id"
                element={
                  <ProtectedRoute>
                    <TaskDetail />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/edit-task/:id"
                element={
                  <ProtectedRoute>
                    <EditTask />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/test-emails"
                element={
                  <ProtectedRoute>
                    <TestEmails />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/test-onesignal"
                element={
                  <ProtectedRoute>
                    <TestOneSignal />
                  </ProtectedRoute>
                }
              />

              {/* MUST ALWAYS BE LAST */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
