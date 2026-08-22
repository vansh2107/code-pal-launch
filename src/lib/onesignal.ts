import OneSignal from "onesignal-cordova-plugin";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const ONESIGNAL_APP_ID = "8cced195-0fd2-487f-9f10-2a8bc898ff4e";
const LOG = "[NOTIFICATIONS]";

// ── Module-level singletons (survive React re-renders / HMR) ──
let initStarted = false;
let initCompleted = false;
let listenersAttached = false;
let pendingUserId: string | null = null;
let lastSavedPlayerId: string | null = null;
let saveInFlight = false;

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
    if (error) console.error(`${LOG} Error notification-action`, error);
    return data;
  } catch (e) {
    console.error(`${LOG} Error notification-action exception`, e);
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

/** Is the OneSignal cordova bridge actually available in this webview? */
function isOneSignalAvailable(): boolean {
  try {
    return (
      typeof OneSignal !== "undefined" &&
      typeof (OneSignal as any).initialize === "function" &&
      !!(OneSignal as any).User
    );
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait until the cordova/Capacitor bridge has exposed the OneSignal plugin.
 * Does NOT depend on `deviceready` having not-yet-fired: it polls, and also
 * short-circuits if deviceready arrives while polling.
 */
async function waitForBridge(maxMs = 15000): Promise<boolean> {
  if (isOneSignalAvailable()) return true;

  let deviceReady = false;
  const onReady = () => {
    deviceReady = true;
  };
  document.addEventListener("deviceready", onReady, { once: true });

  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (isOneSignalAvailable()) {
      document.removeEventListener("deviceready", onReady);
      return true;
    }
    await sleep(250);
    if (deviceReady && isOneSignalAvailable()) {
      document.removeEventListener("deviceready", onReady);
      return true;
    }
  }
  document.removeEventListener("deviceready", onReady);
  return isOneSignalAvailable();
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  try {
    // Push subscription changes → this is the event-driven registration path
    (OneSignal as any).User.pushSubscription.addEventListener("change", (event: any) => {
      const current = event?.current ?? {};
      console.log(`${LOG} Subscription state`, {
        id: current.id ?? null,
        optedIn: current.optedIn ?? null,
        hasToken: !!current.token,
      });
      if (current?.id) {
        console.log(`${LOG} Subscription/player ID obtained`, current.id);
        if (pendingUserId) void persistPlayerId(pendingUserId, current.id);
      }
    });
  } catch (e) {
    console.error(`${LOG} Error attaching pushSubscription listener`, e);
  }

  try {
    (OneSignal as any).Notifications.addEventListener("permissionChange", (granted: boolean) => {
      console.log(`${LOG} Permission status changed`, granted);
      if (granted && pendingUserId) void registerDeviceWithRetry(pendingUserId);
    });
  } catch (e) {
    console.error(`${LOG} Error attaching permissionChange listener`, e);
  }

  try {
    (OneSignal as any).Notifications.addEventListener("click", async (event: any) => {
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
      if (actionId === "complete") {
        await callAction({ ...entity, action: "complete" } as any);
        return;
      }
      if (actionId === "snooze_1h") {
        await callAction({ ...entity, action: "snooze", snooze: 60 } as any);
        return;
      }
      if (actionId === "more") {
        window.location.href = deepLinkForEntity(entity.entity_type, data);
        return;
      }
      if (actionId === "open_app") {
        window.location.href = "/";
      }
    });

    (OneSignal as any).Notifications.addEventListener("foregroundWillDisplay", (event: any) => {
      console.log(`${LOG} Foreground notification`, event?.notification?.title);
    });
  } catch (e) {
    console.error(`${LOG} Error attaching notification listeners`, e);
  }
}

/**
 * Initialize OneSignal exactly once on a native Capacitor platform.
 * Safe to call from multiple places / re-renders.
 */
export const initOneSignal = async (): Promise<boolean> => {
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();
  console.log(`${LOG} Platform detected: ${platform}`);

  if (!isNative) {
    console.log(`${LOG} Web environment — skipping native OneSignal init`);
    return false;
  }
  console.log(`${LOG} Native environment detected`);

  if (initStarted) {
    return initCompleted;
  }
  initStarted = true;

  try {
    console.log(`${LOG} OneSignal initialization started`);
    const ready = await waitForBridge();
    if (!ready) {
      console.error(`${LOG} Error: OneSignal plugin bridge unavailable after wait`);
      initStarted = false; // allow a later retry
      return false;
    }

    (OneSignal as any).initialize(ONESIGNAL_APP_ID);
    initCompleted = true;
    console.log(`${LOG} OneSignal initialized`);

    attachListeners();

    // Ask for permission (no-op if already granted)
    try {
      const granted = await (OneSignal as any).Notifications.requestPermission(true);
      console.log(`${LOG} Permission status`, granted);
    } catch (e) {
      console.error(`${LOG} Error requesting permission`, e);
    }

    // Make sure the device is opted in to push
    try {
      (OneSignal as any).User.pushSubscription.optIn?.();
    } catch {
      /* optIn not available on older plugin versions */
    }

    const sub = (OneSignal as any).User?.pushSubscription;
    console.log(`${LOG} Subscription state`, {
      id: sub?.id ?? null,
      optedIn: sub?.optedIn ?? null,
    });

    if (pendingUserId) void registerDeviceWithRetry(pendingUserId);
    return true;
  } catch (error) {
    console.error(`${LOG} Error initializing OneSignal`, error);
    initStarted = false;
    return false;
  }
};

/** Read the current subscription id, supporting both sync-prop and async-getter plugin versions. */
export const getPlayerId = async (): Promise<string | null> => {
  try {
    const sub = (OneSignal as any)?.User?.pushSubscription;
    if (!sub) return null;
    if (typeof sub.getIdAsync === "function") {
      const id = await sub.getIdAsync();
      if (id) return id;
    }
    return sub.id || null;
  } catch (error) {
    console.error(`${LOG} Error reading player ID`, error);
    return null;
  }
};

async function persistPlayerId(userId: string, playerId: string): Promise<boolean> {
  if (lastSavedPlayerId === playerId) return true;
  if (saveInFlight) return false;
  saveInFlight = true;
  try {
    console.log(`${LOG} Saving device registration`, { playerId, provider: "onesignal" });

    // Primary store (unique on player_id → upsert prevents duplicates)
    const { error } = await supabase
      .from("onesignal_player_ids")
      .upsert(
        {
          user_id: userId,
          player_id: playerId,
          device_info: `${Capacitor.getPlatform()} | ${navigator.userAgent}`,
        } as any,
        { onConflict: "player_id" }
      );

    if (error) {
      console.error(`${LOG} Error saving device registration`, error);
      return false;
    }

    // Mirror into notification_tokens so the unified sender sees the provider
    try {
      const { error: fnError } = await supabase.functions.invoke("update-notification-token", {
        body: {
          token: playerId,
          provider: "onesignal",
          platform: Capacitor.getPlatform(),
          device_info: `${Capacitor.getPlatform()} | ${navigator.userAgent}`,
        },
      });
      if (fnError) console.error(`${LOG} Error mirroring token to backend`, fnError);
    } catch (e) {
      console.error(`${LOG} Error invoking update-notification-token`, e);
    }

    lastSavedPlayerId = playerId;
    console.log(`${LOG} Device registration saved`);
    return true;
  } finally {
    saveInFlight = false;
  }
}

/**
 * Wait for a valid OneSignal subscription ID with bounded exponential backoff,
 * then persist it. Replaces the old single 3-second timeout.
 */
export async function registerDeviceWithRetry(userId: string, maxAttempts = 8): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  pendingUserId = userId;

  if (!initCompleted) {
    const ok = await initOneSignal();
    if (!ok) return false;
  }

  let delay = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const playerId = await getPlayerId();
    console.log(`${LOG} Registration attempt ${attempt}/${maxAttempts}`, { playerId });
    if (playerId) {
      return persistPlayerId(userId, playerId);
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 15000);
  }

  console.error(
    `${LOG} Error: no OneSignal subscription ID after ${maxAttempts} attempts — device not registered`
  );
  return false;
}

/** Back-compat wrapper used by useAuth. */
export const savePlayerIdToSupabase = async (userId: string) => registerDeviceWithRetry(userId);

export const setUserEmail = async (email: string) => {
  try {
    if (!initCompleted) return;
    (OneSignal as any).User.addEmail(email);
  } catch (error) {
    console.error(`${LOG} Error setting user email`, error);
  }
};

/** Diagnostics helper for the test screen. */
export async function getOneSignalDiagnostics() {
  const sub = (OneSignal as any)?.User?.pushSubscription;
  return {
    platform: Capacitor.getPlatform(),
    isNative: Capacitor.isNativePlatform(),
    bridgeAvailable: isOneSignalAvailable(),
    initCompleted,
    playerId: await getPlayerId(),
    optedIn: sub?.optedIn ?? null,
  };
}
