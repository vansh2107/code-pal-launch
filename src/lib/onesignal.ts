import OneSignal from "onesignal-cordova-plugin";
import { supabase } from "@/integrations/supabase/client";

const ONESIGNAL_APP_ID = "8cced195-0fd2-487f-9f10-2a8bc898ff4e";
const LOG = "[NOTIFICATIONS]";

// Module-level singletons — safe across re-renders and HMR reloads.
let initStarted = false;
let initCompleted = false;
let listenersAttached = false;
let currentUserId: string | null = null;

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
    if (error) console.error(`${LOG} notification-action error`, error);
    return data;
  } catch (e) {
    console.error(`${LOG} notification-action exception`, e);
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

/**
 * Wait for the Cordova/Capacitor bridge to expose the OneSignal plugin.
 * Does NOT depend on `deviceready` having not yet fired — by the time the
 * deferred import runs, that event is usually already gone.
 */
function waitForBridge(timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const pluginReady = () =>
      typeof (window as any).plugins?.OneSignal !== "undefined" ||
      typeof (OneSignal as any)?.initialize === "function";

    if (pluginReady()) return resolve(true);

    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("deviceready", onDeviceReady);
      clearInterval(poll);
      resolve(ok);
    };
    const onDeviceReady = () => {
      if (pluginReady()) finish(true);
    };
    document.addEventListener("deviceready", onDeviceReady);

    const poll = setInterval(() => {
      if (pluginReady()) return finish(true);
      if (Date.now() - started > timeoutMs) {
        console.warn(`${LOG} OneSignal plugin not available after ${timeoutMs}ms`);
        finish(false);
      }
    }, 250);
  });
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  try {
    OneSignal.User.pushSubscription.addEventListener("change", (event: any) => {
      const id = event?.current?.id;
      console.log(`${LOG} pushSubscription changed`, {
        hasId: !!id,
        optedIn: event?.current?.optedIn,
      });
      if (id && currentUserId) {
        void persistPlayerId(currentUserId, id);
      }
    });
  } catch (e) {
    console.warn(`${LOG} could not attach pushSubscription listener`, e);
  }

  try {
    OneSignal.Notifications.addEventListener("permissionChange", (granted: boolean) => {
      console.log(`${LOG} permission changed`, { granted });
      if (granted && currentUserId) {
        void registerDeviceWithRetry(currentUserId);
      }
    });
  } catch (e) {
    console.warn(`${LOG} could not attach permissionChange listener`, e);
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
    if (actionId === "complete") {
      await callAction({ ...entity, action: "complete" });
      return;
    }
    if (actionId === "snooze_1h") {
      await callAction({ ...entity, action: "snooze", snooze: 60 });
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

  OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: any) => {
    console.log(`${LOG} foreground notification`, { id: event?.notification?.notificationId });
  });
}

/**
 * Initialize OneSignal. Idempotent — safe to call multiple times.
 */
export const initOneSignal = async (): Promise<boolean> => {
  if (initCompleted) return true;
  if (initStarted) return initCompleted;
  initStarted = true;

  const ready = await waitForBridge();
  if (!ready) {
    initStarted = false;
    return false;
  }

  try {
    OneSignal.initialize(ONESIGNAL_APP_ID);
    attachListeners();

    try {
      await OneSignal.Notifications.requestPermission(true);
    } catch (e) {
      console.warn(`${LOG} requestPermission failed`, e);
    }

    try {
      OneSignal.User.pushSubscription.optIn();
    } catch (e) {
      console.warn(`${LOG} optIn failed`, e);
    }

    initCompleted = true;
    console.log(`${LOG} OneSignal initialized`);
    return true;
  } catch (error) {
    initStarted = false;
    console.error(`${LOG} OneSignal init error`, error);
    return false;
  }
};

export const getPlayerId = async (): Promise<string | null> => {
  try {
    const sub: any = OneSignal.User.pushSubscription;
    if (typeof sub?.getIdAsync === "function") {
      const id = await sub.getIdAsync();
      if (id) return id;
    }
    return sub?.id || null;
  } catch (error) {
    console.error(`${LOG} error getting player ID`, error);
    return null;
  }
};

/**
 * Upsert the player ID (no duplicates) and mirror it into notification_tokens.
 */
export const persistPlayerId = async (userId: string, playerId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from("onesignal_player_ids")
      .upsert(
        {
          user_id: userId,
          player_id: playerId,
          device_info: navigator.userAgent,
        } as any,
        { onConflict: "player_id" }
      );

    if (error) {
      console.error(`${LOG} failed to upsert player ID`, error);
      return false;
    }

    // Mirror into the unified token table (best-effort).
    try {
      await supabase.functions.invoke("update-notification-token", {
        body: { token: playerId, provider: "onesignal", device_info: navigator.userAgent },
      });
    } catch (e) {
      console.warn(`${LOG} token mirror failed`, e);
    }

    console.log(`${LOG} player ID registered`);
    return true;
  } catch (error) {
    console.error(`${LOG} persistPlayerId exception`, error);
    return false;
  }
};

/**
 * Register the device with bounded exponential backoff — the subscription ID
 * is often not assigned for several seconds after init on a physical device.
 */
export const registerDeviceWithRetry = async (userId: string, maxAttempts = 8): Promise<boolean> => {
  currentUserId = userId;
  const ok = await initOneSignal();
  if (!ok) return false;

  let delay = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const playerId = await getPlayerId();
    if (playerId) {
      return persistPlayerId(userId, playerId);
    }
    console.log(`${LOG} no subscription ID yet (attempt ${attempt}/${maxAttempts})`);
    if (attempt === maxAttempts) break;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 15000);
  }
  console.warn(`${LOG} gave up waiting for OneSignal subscription ID`);
  return false;
};

/** Back-compat entry point used by useAuth. */
export const savePlayerIdToSupabase = async (userId: string): Promise<boolean> => {
  return registerDeviceWithRetry(userId);
};

export const getOneSignalDiagnostics = async () => {
  let permission: boolean | null = null;
  let optedIn: boolean | null = null;
  try {
    permission = await OneSignal.Notifications.getPermissionAsync();
  } catch {
    /* plugin unavailable */
  }
  try {
    optedIn = (OneSignal.User.pushSubscription as any)?.optedIn ?? null;
  } catch {
    /* plugin unavailable */
  }
  return {
    appId: ONESIGNAL_APP_ID,
    initStarted,
    initCompleted,
    listenersAttached,
    playerId: await getPlayerId(),
    permission,
    optedIn,
  };
};

export const setUserEmail = async (email: string) => {
  try {
    await OneSignal.User.addEmail(email);
  } catch (error) {
    console.error(`${LOG} error setting user email`, error);
  }
};
