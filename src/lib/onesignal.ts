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

export const initOneSignal = () => {
  console.log("Initializing OneSignal listeners...");
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
      console.log("Notification received in foreground:", event);
    });

    console.log("OneSignal listeners set up successfully");
  } catch (error) {
    console.error("Error setting up OneSignal event listeners:", error);
  }
};

export const getPlayerId = async (): Promise<string | null> => {
  for (let i = 0; i < 30; i++) { // Poll for up to 15 seconds (30 * 500ms)
    try {
      const subscription = OneSignal.User.pushSubscription;
      const playerId = subscription?.id;
      if (playerId) {
        return playerId;
      }
    } catch (error) {
      // Ignore errors during initial phases while native bridges load
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  console.warn("OneSignal player ID not available after polling");
  return null;
};

export const savePlayerIdToSupabase = async (userId: string) => {
  try {
    const playerId = await getPlayerId();
    if (!playerId) return false;

    const { data: existing } = await supabase
      .from("onesignal_player_ids")
      .select("id")
      .eq("user_id", userId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (existing) return true;

    const { error } = await supabase.from("onesignal_player_ids").insert({
      user_id: userId,
      player_id: playerId,
      device_info: navigator.userAgent,
    } as any);
    if (error) {
      console.error("Error saving Player ID:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error in savePlayerIdToSupabase:", error);
    return false;
  }
};

export const setUserEmail = async (email: string) => {
  try {
    await OneSignal.User.addEmail(email);
  } catch (error) {
    console.error("Error setting user email:", error);
  }
};
