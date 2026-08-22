import OneSignal from "onesignal-cordova-plugin";
import { supabase } from "@/integrations/supabase/client";

const ONESIGNAL_APP_ID = "8cced195-0fd2-487f-9f10-2a8bc898ff4e";

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

let initialized = false;
let lastKnownUserId: string | null = null;

function attachListeners() {
  OneSignal.Notifications.addEventListener("click", async (event: any) => {
    console.log("[OS] Notification clicked:", event);
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
      window.location.href = deepLinkForEntity(entity.entity_type, data);
      return;
    }
    if (actionId === "open_app") {
      window.location.href = "/";
    }
  });

  OneSignal.Notifications.addEventListener("foregroundWillDisplay", (event: any) => {
    console.log("[OS] Notification received in foreground:", event);
  });

  // Subscription changes are the ONLY reliable moment the subscription id exists.
  try {
    OneSignal.User.pushSubscription.addEventListener("change", (event: any) => {
      const id = event?.current?.id || null;
      console.log("[OS] pushSubscription change → id:", id, "optedIn:", event?.current?.optedIn);
      if (id && lastKnownUserId) {
        void persistPlayerId(lastKnownUserId, id);
      }
    });
  } catch (e) {
    console.error("[OS] Failed to attach pushSubscription listener", e);
  }
}

function doInit() {
  if (initialized) return;
  initialized = true;
  try {
    console.log("[OS] Initializing OneSignal…", ONESIGNAL_APP_ID);
    OneSignal.initialize(ONESIGNAL_APP_ID);
    OneSignal.Notifications.requestPermission(true).then?.((granted: boolean) => {
      console.log("[OS] requestPermission →", granted);
    });
    attachListeners();
    // If a user is already signed in, start syncing the id right away.
    if (lastKnownUserId) void savePlayerIdToSupabase(lastKnownUserId);
    console.log("[OS] OneSignal initialized");
  } catch (e) {
    initialized = false;
    console.error("[OS] OneSignal init failed", e);
  }
}

export const initOneSignal = () => {
  // Capacitor fires `deviceready` for Cordova plugins, but it may already have
  // fired before this deferred initializer runs — in that case the old
  // listener-only approach never executed. Handle both cases.
  if ((window as any).cordova?.plugins || (window as any).plugins || (window as any).cordova) {
    doInit();
  }
  document.addEventListener("deviceready", doInit, { once: true });
  // Final safety net for slow plugin bridges.
  setTimeout(doInit, 4000);
};

export const getPlayerId = async (): Promise<string | null> => {
  try {
    return OneSignal.User.pushSubscription.id || null;
  } catch (error) {
    console.error("[OS] Error getting OneSignal Player ID:", error);
    return null;
  }
};

async function persistPlayerId(userId: string, playerId: string): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from("onesignal_player_ids")
      .select("id")
      .eq("user_id", userId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (existing) {
      console.log("[OS] Player ID already stored:", playerId);
      return true;
    }

    const { error } = await supabase.from("onesignal_player_ids").insert({
      user_id: userId,
      player_id: playerId,
      device_info: navigator.userAgent,
    } as any);

    if (error) {
      console.error("[OS] Error saving Player ID:", error);
      return false;
    }
    console.log("[OS] Player ID saved:", playerId);
    return true;
  } catch (error) {
    console.error("[OS] persistPlayerId exception:", error);
    return false;
  }
}

/**
 * Poll for the OneSignal subscription id (it is null for a few seconds after
 * app start) and store it against the signed-in user.
 */
export const savePlayerIdToSupabase = async (userId: string): Promise<boolean> => {
  lastKnownUserId = userId;
  for (let attempt = 0; attempt < 15; attempt++) {
    const playerId = await getPlayerId();
    if (playerId) {
      return persistPlayerId(userId, playerId);
    }
    console.log(`[OS] Subscription id not ready (attempt ${attempt + 1}/15)`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.warn("[OS] Gave up waiting for OneSignal subscription id");
  return false;
};

export const setUserEmail = async (email: string) => {
  try {
    await OneSignal.User.addEmail(email);
  } catch (error) {
    console.error("[OS] Error setting user email:", error);
  }
};

