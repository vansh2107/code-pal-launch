import OneSignal from "onesignal-cordova-plugin";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const ONESIGNAL_APP_ID = "8cced195-0fd2-487f-9f10-2a8bc898ff4e";
const RETRY_DELAYS = [0, 1000, 2000, 4000, 8000, 15000, 15000, 15000];

let initialization: Promise<boolean> | null = null;
let listenersAttached = false;
let activeUserId: string | null = null;

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

/**
 * Resolve an entity from notification data. Newer payloads include
 * entity_type / entity_id; older ones we infer from `type` + ids.
 */
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
    const { data, error } = await supabase.functions.invoke("notification-action", {
      body: payload,
    });
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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  try {
    OneSignal.Notifications.addEventListener("click", async (event: any) => {
      console.log("Notification clicked:", event);
      const data: NotifData = (event?.notification?.additionalData || {}) as NotifData;
      const actionId: string | undefined = event?.result?.actionId;
      const entity = resolveEntity(data);

      if (!actionId) {
        // Body tap → just open app to a useful place
        const url = deepLinkForEntity(entity?.entity_type, data);
        window.location.href = url;
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
        // Open the app to the entity with snooze sheet
        window.location.href = deepLinkForEntity(entity.entity_type, data);
        return;
      }
      if (actionId === "open_app") {
        window.location.href = "/";
      }
    });

    OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: any) => {
      console.log("[NOTIFICATIONS] Notification received in foreground", event);
    });

    OneSignal.Notifications.addEventListener("permissionChange", () => {
      if (activeUserId) void registerDeviceWithRetry(activeUserId);
    });

    OneSignal.User.pushSubscription.addEventListener("change", event => {
      const subscriptionId = event.current?.id;
      if (activeUserId && subscriptionId) void persistPlayerId(activeUserId, subscriptionId);
    });
  } catch (error) {
    listenersAttached = false;
    console.error("[NOTIFICATIONS] Could not attach OneSignal listeners", error);
  }
}

export const initOneSignal = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  if (initialization) return initialization;

  initialization = (async () => {
    try {
      OneSignal.initialize(ONESIGNAL_APP_ID);
      attachListeners();
      console.log("[NOTIFICATIONS] OneSignal initialized");
      return true;
    } catch (error) {
      initialization = null;
      console.error("[NOTIFICATIONS] OneSignal initialization failed", error);
      return false;
    }
  })();

  return initialization;
};

export const getPlayerId = async (): Promise<string | null> => {
  try {
    return await OneSignal.User.pushSubscription.getIdAsync();
  } catch {
    return OneSignal.User.pushSubscription.id ?? null;
  }
};

async function persistPlayerId(userId: string, playerId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("update-notification-token", {
      body: {
        token: playerId,
        provider: "onesignal",
        device_info: `android | ${navigator.userAgent}`,
      },
    });
    if (error) {
      console.error("[NOTIFICATIONS] Device registration request failed", error);
      return false;
    }
    if (!data?.success) {
      console.error("[NOTIFICATIONS] Device registration rejected", data);
      return false;
    }
    console.log("[NOTIFICATIONS] Device registered", playerId);
    return true;
  } catch (error) {
    console.error("[NOTIFICATIONS] Device registration failed", error);
    return false;
  }
}

export const registerDeviceWithRetry = async (userId: string): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  activeUserId = userId;
  if (!(await initOneSignal())) return false;

  try {
    OneSignal.login(userId);
    await OneSignal.Notifications.requestPermission(true);
    OneSignal.User.pushSubscription.optIn();
  } catch (error) {
    console.warn("[NOTIFICATIONS] Permission or opt-in request failed", error);
  }

  for (const retryDelay of RETRY_DELAYS) {
    if (retryDelay) await delay(retryDelay);
    const playerId = await getPlayerId();
    if (playerId && await persistPlayerId(userId, playerId)) return true;
  }

  console.error("[NOTIFICATIONS] No OneSignal subscription ID after retries");
  return false;
};

export const savePlayerIdToSupabase = registerDeviceWithRetry;

export const unregisterOneSignalUser = async () => {
  activeUserId = null;
  if (!Capacitor.isNativePlatform()) return;
  try {
    OneSignal.logout();
  } catch (error) {
    console.warn("[NOTIFICATIONS] OneSignal logout failed", error);
  }
};

export const setUserEmail = async (email: string) => {
  try {
    await OneSignal.User.addEmail(email);
  } catch (error) {
    console.error("Error setting user email:", error);
  }
};

export const getOneSignalDiagnostics = async () => {
  if (!Capacitor.isNativePlatform()) {
    return { platform: "web", initialized: false, permission: Notification.permission };
  }
  const initialized = await initOneSignal();
  const [subscriptionId, optedIn, permission] = await Promise.all([
    getPlayerId(),
    OneSignal.User.pushSubscription.getOptedInAsync().catch(() => false),
    OneSignal.Notifications.getPermissionAsync().catch(() => false),
  ]);
  return { platform: Capacitor.getPlatform(), initialized, permission, optedIn, subscriptionId };
};
