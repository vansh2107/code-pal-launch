import { supabase } from "@/integrations/supabase/client";
import {
  getPendingSyncItems,
  removePendingSync,
  saveTasksOffline,
  saveDocumentsOffline,
  setMeta,
  type OfflineTask,
  type OfflineDocument,
} from "./offlineStorage";

type SyncStatus = "idle" | "syncing" | "error" | "success";
type SyncListener = (status: SyncStatus, message?: string) => void;

const listeners = new Set<SyncListener>();
let currentStatus: SyncStatus = "idle";

function notify(status: SyncStatus, message?: string) {
  currentStatus = status;
  listeners.forEach((fn) => fn(status, message));
}

export function onSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  // Send current status immediately
  listener(currentStatus);
  return () => listeners.delete(listener);
}

// ── Push pending offline changes to server ──
export async function pushPendingChanges(): Promise<number> {
  const items = await getPendingSyncItems();
  if (items.length === 0) return 0;

  let synced = 0;

  for (const item of items) {
    try {
      if (item.table === "tasks") {
        if (item.action === "update") {
          const { error } = await supabase
            .from("tasks")
            .update(item.data as Record<string, unknown>)
            .eq("id", item.record_id);
          if (error) throw error;
        } else if (item.action === "delete") {
          const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", item.record_id);
          if (error) throw error;
        }
        // insert handled normally through existing flow
      }

      if (item.table === "documents") {
        if (item.action === "update") {
          const { error } = await supabase
            .from("documents")
            .update(item.data as Record<string, unknown>)
            .eq("id", item.record_id);
          if (error) throw error;
        }
      }

      await removePendingSync(item.id);
      synced++;
    } catch (err) {
      console.error(`Sync failed for ${item.id}:`, err);
      // Keep in queue for retry
    }
  }

  return synced;
}

// ── Pull latest data from server into IndexedDB ──
export async function pullLatestData(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const [tasksResult, docsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, description, start_time, end_time, total_time_minutes, status, image_path, consecutive_missed_days, task_date, original_date, local_date, user_id, updated_at")
      .eq("user_id", user.id)
      .order("task_date", { ascending: false })
      .limit(500),
    supabase
      .from("documents")
      .select("id, name, document_type, expiry_date, issuing_authority, category_detail, notes, image_path, user_id, updated_at")
      .eq("user_id", user.id)
      .limit(500),
  ]);

  if (tasksResult.data) {
    await saveTasksOffline(tasksResult.data as OfflineTask[]);
  }
  if (docsResult.data) {
    await saveDocumentsOffline(docsResult.data as OfflineDocument[]);
  }

  await setMeta("lastSync", new Date().toISOString());
}

// ── Full sync: push then pull ──
export async function fullSync(): Promise<{ pushed: number }> {
  if (!navigator.onLine) {
    notify("error", "No internet connection");
    return { pushed: 0 };
  }

  notify("syncing");

  try {
    const pushed = await pushPendingChanges();
    await pullLatestData();
    notify("success", pushed > 0 ? `Synced ${pushed} offline change${pushed > 1 ? "s" : ""}` : "Data up to date");
    return { pushed };
  } catch (err) {
    console.error("Full sync error:", err);
    notify("error", "Sync failed");
    return { pushed: 0 };
  }
}

// ── Auto-sync on reconnect ──
let autoSyncRegistered = false;

export function registerAutoSync(): void {
  if (autoSyncRegistered) return;
  autoSyncRegistered = true;

  window.addEventListener("online", () => {
    // Small delay to let network stabilize
    setTimeout(() => fullSync(), 2000);
  });

  // Also sync on visibility change (app foregrounded)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      fullSync();
    }
  });
}
