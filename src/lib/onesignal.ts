import OneSignal from "onesignal-cordova-plugin";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const ONESIGNAL_APP_ID = "8cced195-0fd2-487f-9f10-2a8bc898ff4e";

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

let initialized = false;
let registrationInFlight: Promise<PushRegistrationResult> | null = null;

export interface PushStatus {
  /** running inside the native app where real push is possible */
  native: boolean;
  /** OS-level notification permission */
  permission: boolean;
  /** OneSignal push subscription id (a.k.a. player id) */
  subscriptionId: string | null;
  /** subscribed & opted in at the OneSignal level */
  optedIn: boolean;
}

export interface PushRegistrationResult {
  ok: boolean;
  reason?: "not_native" | "permission_denied" | "no_subscription" | "save_failed";
  subscriptionId?: string | null;
}

const isNative = () => Capacitor.isNativePlatform();

/* ------------------------------------------------------------------ */
/* Notification action handling                                        */
/* ------------------------------------------------------------------ */

function resolveEntity(data: NotifData): { entity_type: NotifData["entity_type"]; entity_id: string } | null {
  if (data.entity_type && data.entity_id) {
    return { entity_type: data.entity_type, entity_id: data.entity_id };
  }
  if (data.type?.startsWith("task") && data.task_id) {
    return { entity_type: "task", entity_id: data.task_id };
  }
  if (data.type === "document_reminder" && data.reminder_id) {
    return { entity_type: "document_reminder", entity_id: data.reminder_id };
  }
  if (data.type === "routine_task" && data.slot_id) {
    return { entity_type: "routine_step", entity_id: data.slot_id };
  }
  return null;
}

async function callAction(payload: {
  entity_type: string;
  entity_id: string;
  action: "complete" | "snooze";
  snooze?: number | "tonight" | "tomorrow";
}) {
  try {
    const { data, error } = await supabase.functions.invoke("notification-action", { body: payload });
    if (error) console.error("notification-action error", error);
    return data;
  } catch (e) {
    console.error("notification-action exception", e);
  }
}

function deepLinkForEntity(entity_type: string | undefined, data: NotifData) {
  if (entity_type === "task" && (data.entity_id || data.task_id)) {
    return `/task/${data.entity_id || data.task_id}?snooze=1`;
  }
  if (entity_type === "document_reminder" && data.document_id) {
    return `/documents/${data.document_id}?snooze=1`;
  }
  if (entity_type === "routine_step" && data.routine_id) {
    return `/tasks?routine=${data.routine_id}&snooze=1`;
  }
  return "/";
}

/* ------------------------------------------------------------------ */
/* Initialization                                                      */
/* ------------------------------------------------------------------ */

export const initOneSignal = () => {
  if (!isNative() || initialized) return;
  initialized = true;

  try {
    // Safe to call even when the native Application class already initialized.
    try {
      (OneSignal as any).initialize?.(ONESIGNAL_APP_ID);
    } catch (e) {
      console.warn("OneSignal.initialize skipped:", e);
    }

    OneSignal.Notifications.addEventListener("click", async (event: any) => {
      const data: NotifData = (event?.notification?.additionalData || {}) as NotifData;
      const actionId: string | undefined = event?.result?.actionId;
      const entity = resolveEntity(data);

      if (!actionId) {
        window.location.href = deepLinkForEntity(entity?.entity_type, data);
        return;
      }
      if (!entity) {
        window.location.href = "/";
        return;
      }
      if (actionId === "complete") return void (await callAction({ ...entity, action: "complete" } as any));
      if (actionId === "snooze_1h") return void (await callAction({ ...entity, action: "snooze", snooze: 60 } as any));
      if (actionId === "more") {
        window.location.href = deepLinkForEntity(entity.entity_type, data);
        return;
      }
      if (actionId === "open_app") window.location.href = "/";
    });

    OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: any) => {
      console.log("Notification received in foreground:", event?.notification?.title);
    });

    // Re-sync the stored subscription id whenever OneSignal rotates/creates it.
    try {
      (OneSignal.User.pushSubscription as any).addEventListener?.("change", async () => {
        const { data } = await supabase.auth.getUser();
        if (data.user) await ensurePushRegistration(data.user.id, { silent: true });
      });
    } catch (e) {
      console.warn("Could not attach pushSubscription listener:", e);
    }

    console.log("OneSignal initialized");
  } catch (error) {
    console.error("Error initializing OneSignal:", error);
  }
};

/* ------------------------------------------------------------------ */
/* Status helpers                                                      */
/* ------------------------------------------------------------------ */

async function getSubscriptionId(): Promise<string | null> {
  try {
    const sub: any = OneSignal.User.pushSubscription;
    if (typeof sub?.getIdAsync === "function") {
      return (await sub.getIdAsync()) || null;
    }
    return sub?.id || null;
  } catch {
    return null;
  }
}

async function getOptedIn(): Promise<boolean> {
  try {
    const sub: any = OneSignal.User.pushSubscription;
    if (typeof sub?.getOptedInAsync === "function") return !!(await sub.getOptedInAsync());
    return !!sub?.optedIn;
  } catch {
    return false;
  }
}

async function getPermission(): Promise<boolean> {
  try {
    const n: any = OneSignal.Notifications;
    if (typeof n?.getPermissionAsync === "function") return !!(await n.getPermissionAsync());
    return !!n?.hasPermission?.();
  } catch {
    return false;
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isNative()) {
    const webPerm = typeof Notification !== "undefined" && Notification.permission === "granted";
    return { native: false, permission: webPerm, subscriptionId: null, optedIn: false };
  }
  const [permission, subscriptionId, optedIn] = await Promise.all([
    getPermission(),
    getSubscriptionId(),
    getOptedIn(),
  ]);
  return { native: true, permission, subscriptionId, optedIn };
}

export async function requestPushPermission(): Promise<boolean> {
  if (!isNative()) {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    return (await Notification.requestPermission()) === "granted";
  }
  try {
    const granted = await (OneSignal.Notifications as any).requestPermission(true);
    return !!granted;
  } catch (e) {
    console.error("requestPermission failed", e);
    return await getPermission();
  }
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

/**
 * Links the OneSignal device to the signed-in account and persists the
 * subscription id so the backend can target this device.
 */
export async function ensurePushRegistration(
  userId: string,
  opts: { silent?: boolean } = {}
): Promise<PushRegistrationResult> {
  if (!isNative()) return { ok: false, reason: "not_native" };
  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = (async (): Promise<PushRegistrationResult> => {
    try {
      initOneSignal();

      // Link the device to this account (enables external_id targeting).
      try {
        await (OneSignal as any).login?.(userId);
      } catch (e) {
        console.warn("OneSignal.login failed:", e);
      }

      let permission = await getPermission();
      if (!permission && !opts.silent) {
        permission = await requestPushPermission();
      }
      if (!permission) return { ok: false, reason: "permission_denied" };

      try {
        (OneSignal.User.pushSubscription as any).optIn?.();
      } catch {
        /* ignore */
      }

      // Wait (up to ~15s) for the subscription id to become available.
      let subscriptionId: string | null = null;
      for (let i = 0; i < 30 && !subscriptionId; i++) {
        subscriptionId = await getSubscriptionId();
        if (!subscriptionId) await new Promise((r) => setTimeout(r, 500));
      }
      if (!subscriptionId) return { ok: false, reason: "no_subscription" };

      const saved = await persistSubscription(userId, subscriptionId);
      return saved ? { ok: true, subscriptionId } : { ok: false, reason: "save_failed", subscriptionId };
    } catch (error) {
      console.error("ensurePushRegistration error:", error);
      return { ok: false, reason: "save_failed" };
    } finally {
      setTimeout(() => (registrationInFlight = null), 0);
    }
  })();

  return registrationInFlight;
}

async function persistSubscription(userId: string, subscriptionId: string): Promise<boolean> {
  const deviceInfo = `${Capacitor.getPlatform()} | ${navigator.userAgent}`.substring(0, 400);
  let ok = false;

  // Primary path: authenticated edge function → notification_tokens
  try {
    const { error } = await supabase.functions.invoke("update-notification-token", {
      body: { token: subscriptionId, provider: "onesignal", device_info: deviceInfo },
    });
    if (error) console.error("update-notification-token failed:", error);
    else ok = true;
  } catch (e) {
    console.error("update-notification-token exception:", e);
  }

  // Legacy/back-up path: direct table write (RLS-protected).
  try {
    const { data: existing } = await supabase
      .from("onesignal_player_ids")
      .select("id")
      .eq("user_id", userId)
      .eq("player_id", subscriptionId)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase
        .from("onesignal_player_ids")
        .insert({ user_id: userId, player_id: subscriptionId, device_info: deviceInfo } as any);
      if (error) console.error("player id insert failed:", error);
      else ok = true;
    } else {
      ok = true;
    }
  } catch (e) {
    console.error("player id save exception:", e);
  }

  // Device is push-capable → make sure the backend preference reflects that,
  // otherwise every scheduler skips this user.
  if (ok) {
    try {
      await supabase
        .from("profiles")
        .update({ push_notifications_enabled: true })
        .eq("user_id", userId)
        .eq("push_notifications_enabled", false);
    } catch (e) {
      console.warn("Could not enable push preference:", e);
    }
  }

  return ok;
}

/** Backwards-compatible alias used by older call sites. */
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
  try {
    await (OneSignal.User as any).addEmail(email);
  } catch (error) {
    console.error("Error setting user email:", error);
  }
};

export const logoutOneSignal = async () => {
  if (!isNative()) return;
  try {
    await (OneSignal as any).logout?.();
  } catch (error) {
    console.warn("OneSignal logout failed:", error);
  }
};
