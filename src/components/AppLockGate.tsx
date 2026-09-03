/**
 * AppLockGate
 *
 * Full-screen overlay that blocks the app UI until native device
 * authentication succeeds.  It is only rendered on native (Capacitor)
 * platforms; on web it is transparent and renders children directly.
 *
 * Lifecycle:
 *  1. On mount (cold start / app open), if the platform is native,
 *     trigger authentication immediately.
 *  2. When the app returns from background (appStateChange → isActive),
 *     check whether the grace period has expired and re-lock if needed.
 *  3. While locked, children are NOT rendered — the overlay covers
 *     the whole screen so documents/tasks cannot be seen.
 *  4. Failed / cancelled auth keeps the lock. A "Try Again" button
 *     re-triggers authentication without logging the user out.
 *
 * The /auth route (sign-in / sign-up) is intentionally excluded from
 * the lock: new users must be able to sign up without being interrupted.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { LockKeyhole, Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isAppLockEnabled,
  isUnlocked,
  shouldLockOnResume,
  authenticate,
  lockNow,
} from "@/lib/appLock";

interface Props {
  children: React.ReactNode;
}

type LockState = "checking" | "locked" | "unlocked";

// Routes that must remain accessible without app-lock (auth flow)
const EXCLUDED_ROUTES = ["/auth", "/reset-password"];

export function AppLockGate({ children }: Props) {
  const location = useLocation();
  const [lockState, setLockState] = useState<LockState>(() => {
    // Fast-path: if lock is not enabled (web) or we're already unlocked
    // in-memory (warm navigate), skip the checking phase entirely.
    if (!isAppLockEnabled() || isUnlocked()) return "unlocked";
    return "checking";
  });
  const [authError, setAuthError] = useState(false);
  const listenerRef = useRef<{ remove: () => void } | null>(null);

  const isExcludedRoute = EXCLUDED_ROUTES.some((r) =>
    location.pathname.startsWith(r)
  );

  const triggerAuth = useCallback(async () => {
    setAuthError(false);
    setLockState("checking");
    const ok = await authenticate();
    if (ok) {
      setLockState("unlocked");
      setAuthError(false);
    } else {
      setLockState("locked");
      setAuthError(true);
    }
  }, []);

  // ── Cold start: authenticate on first mount ──────────────────────────────
  useEffect(() => {
    if (!isAppLockEnabled()) return;
    if (isExcludedRoute) return;
    if (isUnlocked()) {
      setLockState("unlocked");
      return;
    }
    // Kick off authentication immediately
    triggerAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  // ── Background/resume: re-lock when grace period expires ─────────────────
  useEffect(() => {
    if (!isAppLockEnabled()) return;

    const setupListener = async () => {
      try {
        const { App: CapacitorApp } = await import("@capacitor/app");
        listenerRef.current = await CapacitorApp.addListener(
          "appStateChange",
          ({ isActive }) => {
            if (!isActive) return; // going to background — nothing to do yet
            if (isExcludedRoute) return;
            if (shouldLockOnResume()) {
              lockNow();
              setLockState("locked");
              setAuthError(false);
              // Auto-trigger auth on resume rather than waiting for user tap
              triggerAuth();
            }
          }
        );
      } catch (e) {
        console.warn("[AppLockGate] Could not register appStateChange listener:", e);
      }
    };

    setupListener();
    return () => {
      listenerRef.current?.remove();
      listenerRef.current = null;
    };
  }, [isExcludedRoute, triggerAuth]);

  // ── On route changes to excluded routes, always show content ─────────────
  useEffect(() => {
    if (isExcludedRoute) {
      // Do NOT lock — auth pages must always be visible
      setLockState("unlocked");
    }
  }, [isExcludedRoute]);

  // Web or already unlocked
  if (!isAppLockEnabled() || lockState === "unlocked" || isExcludedRoute) {
    return <>{children}</>;
  }

  // ── Lock screen overlay ───────────────────────────────────────────────────
  return (
    <>
      {/* Children intentionally NOT rendered while locked */}
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background gap-6 px-6">
        {/* Branding */}
        <div className="flex flex-col items-center gap-3 mb-4">
          <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
            <LockKeyhole className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Remonk Reminder</h1>
          <p className="text-muted-foreground text-sm text-center">
            Authenticate to access your documents and tasks
          </p>
        </div>

        {/* Status */}
        {lockState === "checking" && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Verifying identity…</p>
          </div>
        )}

        {lockState === "locked" && (
          <div className="flex flex-col items-center gap-4 w-full max-w-xs">
            {authError && (
              <p className="text-sm text-destructive text-center">
                Authentication failed or was cancelled. Tap below to try again.
              </p>
            )}
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={triggerAuth}
            >
              <Fingerprint className="h-5 w-5" />
              Unlock with Device Security
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
