/**
 * src/lib/onesignal.ts — Firebase-backed OneSignal integration
 *
 * Replaces Supabase calls with Firebase equivalents.
 * Public API and behaviour are IDENTICAL so every consumer compiles unchanged.
 *
 * What changed
 * ─────────────
 *   - persistSubscription():
 *       • Primary path: calls Firebase Cloud Function `updateNotificationToken`
 *         instead of `supabase.functions.invoke("update-notification-token")`
 *       • Backup path: writes directly to Firestore
 *         `users/{uid}/onesignal_player_ids/{subscriptionId}`
 *         instead of `supabase.from("onesignal_player_ids").insert(...)`
 *       • Profile push pref: Firestore setDoc merge instead of Supabase update
 *
 *   - callAction():
 *       • Calls Firebase Cloud Function `notificationAction`
 *         instead of `supabase.functions.invoke("notification-action")`
 *
 *   - pushSubscription change listener:
 *       • Uses `firebaseAuth.currentUser.uid` instead of `supabase.auth.getUser()`
 *
 * Nothing else changed — OneSignal SDK calls, initialization, permission
 * request, opt-in, subscription polling, and logout are all preserved.
 */

import OneSignal from "onesignal-cordova-plugin";
import { Capacitor } from "@capacitor/core";
import { httpsCallable } from "firebase/functions";
import {
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { firebaseAuth, firebaseDb, firebaseFunctions } from "@/integrations/firebase/client";

export const ONESIGNAL_APP_ID = "8cced195-0fd2-487f-9f10-2a8bc898ff4e";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type NotifData = {
  entity_type?: "task" | "document_reminder" | "routine_step";
  entity_id?: string;
  type?: string;
  task_id?: string;
  document_id?: string;
  reminder_id?: string;
  slot_id?: string;
  routine_id?: string;
};

export interface PushStatus {
  native:         boolean;
  permission:     boolean;
  subscriptionId: string | null;
  optedIn:        boolean;
}

export interface PushRegistrationResult {
  ok:              boolean;
  reason?:         "not_native" | "permission_denied" | "no_subscription" | "save_failed";
  subscriptionId?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────────────────────

let initialized               = false;
let registrationInFlight: Promise<PushRegistrationResult> | null = null;

const isNative = () => Capacitor.isNativePlatform();

// ─────────────────────────────────────────────────────────────────────────────
// Notification action handler
// ─────────────────────────────────────────────────────────────────────────────

function resolveEntity(data: NotifData): { entity_type: NotifData["entity_type"]; entity_id: string } | null {
  if (data.entity_type && data.entity_id) return { entity_type: data.entity_type, entity_id: data.entity_id };
  if (data.type?.startsWith("task") && data.task_id)           return { entity_type: "task",              entity_id: data.task_id    };
  if (data.type === "document_reminder" && data.reminder_id)   return { entity_type: "document_reminder", entity_id: data.reminder_id };
  if (data.type === "routine_task"      && data.slot_id)        return { entity_type: "routine_step",      entity_id: data.slot_id    };
  return null;
}

/**
 * Calls the Firebase `notificationAction` Cloud Function.
 * Replaces: supabase.functions.invoke("notification-action", ...)
 */
async function callAction(payload: {
  entity_type: string;
  entity_id:   string;
  action:      "complete" | "snooze";
  snooze?:     number | "tonight" | "tomorrow";
}) {
  try {
    const fn     = httpsCallable(firebaseFunctions, "notificationAction");
    const result = await fn(payload);
    return result.data;
  } catch (e) {
    console.error("[onesignal] notificationAction exception:", e);
  }
}

function deepLinkForEntity(entity_type: string | undefined, data: NotifData): string {
  if (entity_type === "task"              && (data.entity_id || data.task_id))  return `/task/${data.entity_id ?? data.task_id}?snooze=1`;
  if (entity_type === "document_reminder" && data.document_id)                  return `/documents/${data.document_id}?snooze=1`;
  if (entity_type === "routine_step"      && data.routine_id)                   return `/tasks?routine=${data.routine_id}&snooze=1`;
  return "/";
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

export const initOneSignal = () => {
  if (!isNative() || initialized) return;
  initialized = true;

  try {
    try { (OneSignal as any).initialize?.(ONESIGNAL_APP_ID); }
    catch (e) { console.warn("[onesignal] initialize skipped:", e); }

    // Notification click handler — unchanged
    OneSignal.Notifications.addEventListener("click", async (event: any) => {
      const data: NotifData = (event?.notification?.additionalData ?? {}) as NotifData;
      const actionId: string | undefined = event?.result?.actionId;
      const entity = resolveEntity(data);

      if (!actionId) {
        window.location.href = deepLinkForEntity(entity?.entity_type, data);
        return;
      }
      if (!entity) { window.location.href = "/"; return; }

      if (actionId === "complete")  { await callAction({ ...entity, action: "complete"             } as any); return; }
      if (actionId === "snooze_1h") { await callAction({ ...entity, action: "snooze",  snooze: 60  } as any); return; }
      if (actionId === "more")      { window.location.href = deepLinkForEntity(entity.entity_type, data); return; }
      if (actionId === "open_app")  { window.location.href = "/"; return; }
    });

    OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: any) => {
      console.log("[onesignal] foreground notification:", event?.notification?.title);
    });

    // Re-sync subscription id when OneSignal rotates it.
    // Uses Firebase Auth instead of Supabase auth.getUser().
    try {
      (OneSignal.User.pushSubscription as any).addEventListener?.("change", async () => {
        const uid = firebaseAuth.currentUser?.uid;
        if (uid) await ensurePushRegistration(uid, { silent: true });
      });
    } catch (e) {
      console.warn("[onesignal] Could not attach pushSubscription listener:", e);
    }

    console.log("[onesignal] Initialized");
  } catch (error) {
    console.error("[onesignal] Initialization error:", error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Status helpers — unchanged from Supabase version
// ─────────────────────────────────────────────────────────────────────────────

async function getSubscriptionId(): Promise<string | null> {
  try {
    const sub: any = OneSignal.User.pushSubscription;
    if (typeof sub?.getIdAsync === "function") return (await sub.getIdAsync()) ?? null;
    return sub?.id ?? null;
  } catch { return null; }
}

async function getOptedIn(): Promise<boolean> {
  try {
    const sub: any = OneSignal.User.pushSubscription;
    if (typeof sub?.getOptedInAsync === "function") return !!(await sub.getOptedInAsync());
    return !!sub?.optedIn;
  } catch { return false; }
}

async function getPermission(): Promise<boolean> {
  try {
    const n: any = OneSignal.Notifications;
    if (typeof n?.getPermissionAsync === "function") return !!(await n.getPermissionAsync());
    return !!n?.hasPermission?.();
  } catch { return false; }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isNative()) {
    const webPerm = typeof Notification !== "undefined" && Notification.permission === "granted";
    return { native: false, permission: webPerm, subscriptionId: null, optedIn: false };
  }
  const [permission, subscriptionId, optedIn] = await Promise.all([
    getPermission(), getSubscriptionId(), getOptedIn(),
  ]);
  return { native: true, permission, subscriptionId, optedIn };
}

export async function requestPushPermission(): Promise<boolean> {
  if (!isNative()) {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied")  return false;
    return (await Notification.requestPermission()) === "granted";
  }
  try {
    const granted = await (OneSignal.Notifications as any).requestPermission(true);
    return !!granted;
  } catch (e) {
    console.error("[onesignal] requestPermission failed", e);
    return await getPermission();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Links the OneSignal device to the signed-in Firebase account and persists
 * the subscription ID so the backend can target this device.
 * Identical public API to the Supabase version.
 */
export async function ensurePushRegistration(
  userId: string,
  opts: { silent?: boolean } = {},
): Promise<PushRegistrationResult> {
  if (!isNative()) return { ok: false, reason: "not_native" };
  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = (async (): Promise<PushRegistrationResult> => {
    try {
      initOneSignal();

      // Link device to the Firebase UID (sets OneSignal external_id = Firebase UID)
      try { await (OneSignal as any).login?.(userId); }
      catch (e) { console.warn("[onesignal] login failed:", e); }

      let permission = await getPermission();
      if (!permission && !opts.silent) {
        permission = await requestPushPermission();
      }
      if (!permission) return { ok: false, reason: "permission_denied" };

      try { (OneSignal.User.pushSubscription as any).optIn?.(); } catch { /* ignore */ }

      // Poll up to 15 s for the subscription id
      let subscriptionId: string | null = null;
      for (let i = 0; i < 30 && !subscriptionId; i++) {
        subscriptionId = await getSubscriptionId();
        if (!subscriptionId) await new Promise((r) => setTimeout(r, 500));
      }
      if (!subscriptionId) return { ok: false, reason: "no_subscription" };

      const saved = await persistSubscription(userId, subscriptionId);
      return saved
        ? { ok: true, subscriptionId }
        : { ok: false, reason: "save_failed", subscriptionId };
    } catch (error) {
      console.error("[onesignal] ensurePushRegistration error:", error);
      return { ok: false, reason: "save_failed" };
    } finally {
      setTimeout(() => (registrationInFlight = null), 0);
    }
  })();

  return registrationInFlight;
}

/**
 * Persist a OneSignal subscription ID to Firestore.
 *
 * Primary path  → Firebase Cloud Function `updateNotificationToken`
 *                 (verifies Firebase Auth, upserts notification_tokens,
 *                  enables push preference on profile)
 * Backup path   → Direct Firestore write to
 *                 users/{uid}/onesignal_player_ids/{subscriptionId}
 *
 * Replaces Supabase:
 *   - supabase.functions.invoke("update-notification-token")
 *   - supabase.from("onesignal_player_ids").insert/select
 *   - supabase.from("profiles").update({ push_notifications_enabled: true })
 */
async function persistSubscription(userId: string, subscriptionId: string): Promise<boolean> {
  const deviceInfo = `${Capacitor.getPlatform()} | ${navigator.userAgent}`.substring(0, 400);
  let ok = false;

  // ── Primary: Cloud Function ───────────────────────────────────────────────
  try {
    const fn = httpsCallable(firebaseFunctions, "updateNotificationToken");
    await fn({ token: subscriptionId, provider: "onesignal", deviceInfo });
    ok = true;
  } catch (e) {
    console.error("[onesignal] updateNotificationToken Cloud Function failed:", e);
  }

  // ── Backup: direct Firestore write ────────────────────────────────────────
  try {
    const playerRef = doc(
      firebaseDb,
      `users/${userId}/onesignal_player_ids/${subscriptionId}`,
    );
    const existing = await getDoc(playerRef);
    if (!existing.exists()) {
      const now = new Date().toISOString();
      await setDoc(playerRef, {
        id:         subscriptionId,
        userId,
        playerId:   subscriptionId,
        deviceInfo,
        createdAt:  now,
        updatedAt:  now,
      });
    }
    ok = true;
  } catch (e) {
    console.error("[onesignal] Firestore backup write failed:", e);
  }

  // ── Enable push preference ────────────────────────────────────────────────
  if (ok) {
    try {
      await setDoc(
        doc(firebaseDb, `users/${userId}/profile/data`),
        { pushNotificationsEnabled: true, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch (e) {
      console.warn("[onesignal] Could not enable push preference:", e);
    }
  }

  return ok;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backwards-compatible aliases
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use ensurePushRegistration instead */
export const savePlayerIdToSupabase = async (userId: string) => {
  const res = await ensurePushRegistration(userId, { silent: true });
  return res.ok;
};

export const getPlayerId = async (): Promise<string | null> => {
  if (!isNative()) return null;
  for (let i = 0; i < 30; i++) {
    const id = await getSubscriptionId();
    if (id) return id;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
};

export const setUserEmail = async (email: string) => {
  if (!isNative()) return;
  try { await (OneSignal.User as any).addEmail(email); }
  catch (error) { console.error("[onesignal] setUserEmail error:", error); }
};

export const logoutOneSignal = async () => {
  if (!isNative()) return;
  try { await (OneSignal as any).logout?.(); }
  catch (error) { console.warn("[onesignal] logout failed:", error); }
};
