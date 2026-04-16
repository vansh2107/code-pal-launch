import { openDB, DBSchema, IDBPDatabase } from "idb";

// ── Schema ──
interface RemonkDB extends DBSchema {
  tasks: {
    key: string;
    value: OfflineTask;
    indexes: { "by-date": string; "by-status": string };
  };
  documents: {
    key: string;
    value: OfflineDocument;
    indexes: { "by-user": string };
  };
  pendingSync: {
    key: string;
    value: PendingSyncItem;
    indexes: { "by-table": string };
  };
  meta: {
    key: string;
    value: { key: string; value: string };
  };
}

export interface OfflineTask {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  total_time_minutes: number | null;
  status: string;
  image_path: string | null;
  consecutive_missed_days: number;
  task_date: string;
  original_date: string;
  local_date: string;
  user_id: string;
  updated_at: string;
}

export interface OfflineDocument {
  id: string;
  name: string;
  document_type: string;
  expiry_date: string;
  issuing_authority: string | null;
  category_detail: string | null;
  notes: string | null;
  image_path: string | null;
  user_id: string;
  updated_at: string;
}

export interface PendingSyncItem {
  id: string;            // unique sync id
  table: "tasks" | "documents";
  record_id: string;     // id of the record
  action: "insert" | "update" | "delete";
  data: Record<string, unknown>;
  created_at: string;
}

// ── DB singleton ──
let dbPromise: Promise<IDBPDatabase<RemonkDB>> | null = null;

function getDB(): Promise<IDBPDatabase<RemonkDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RemonkDB>("remonk-reminder-offline", 1, {
      upgrade(db) {
        // Tasks store
        if (!db.objectStoreNames.contains("tasks")) {
          const taskStore = db.createObjectStore("tasks", { keyPath: "id" });
          taskStore.createIndex("by-date", "task_date");
          taskStore.createIndex("by-status", "status");
        }
        // Documents store
        if (!db.objectStoreNames.contains("documents")) {
          const docStore = db.createObjectStore("documents", { keyPath: "id" });
          docStore.createIndex("by-user", "user_id");
        }
        // Pending sync queue
        if (!db.objectStoreNames.contains("pendingSync")) {
          const syncStore = db.createObjectStore("pendingSync", { keyPath: "id" });
          syncStore.createIndex("by-table", "table");
        }
        // Meta (last sync time etc.)
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// ══════════════ TASKS ══════════════

export async function saveTasksOffline(tasks: OfflineTask[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("tasks", "readwrite");
  await Promise.all(tasks.map((t) => tx.store.put(t)));
  await tx.done;
}

export async function getOfflineTasks(taskDate?: string): Promise<OfflineTask[]> {
  const db = await getDB();
  if (taskDate) {
    return db.getAllFromIndex("tasks", "by-date", taskDate);
  }
  return db.getAll("tasks");
}

export async function getOfflineFutureTasks(afterDate: string): Promise<OfflineTask[]> {
  const db = await getDB();
  const all = await db.getAll("tasks");
  return all
    .filter((t) => t.task_date > afterDate)
    .sort((a, b) => a.task_date.localeCompare(b.task_date) || a.start_time.localeCompare(b.start_time));
}

export async function updateOfflineTask(id: string, changes: Partial<OfflineTask>): Promise<void> {
  const db = await getDB();
  const existing = await db.get("tasks", id);
  if (existing) {
    const updated = { ...existing, ...changes, updated_at: new Date().toISOString() };
    await db.put("tasks", updated);
  }
}

export async function deleteOfflineTask(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("tasks", id);
}

// ══════════════ DOCUMENTS ══════════════

export async function saveDocumentsOffline(docs: OfflineDocument[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("documents", "readwrite");
  await Promise.all(docs.map((d) => tx.store.put(d)));
  await tx.done;
}

export async function getOfflineDocuments(): Promise<OfflineDocument[]> {
  const db = await getDB();
  return db.getAll("documents");
}

export async function deleteOfflineDocument(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("documents", id);
}

// ══════════════ PENDING SYNC QUEUE ══════════════

export async function addPendingSync(item: Omit<PendingSyncItem, "id" | "created_at">): Promise<void> {
  const db = await getDB();
  const entry: PendingSyncItem = {
    ...item,
    id: `${item.table}-${item.record_id}-${Date.now()}`,
    created_at: new Date().toISOString(),
  };
  await db.put("pendingSync", entry);
}

export async function getPendingSyncItems(): Promise<PendingSyncItem[]> {
  const db = await getDB();
  return db.getAll("pendingSync");
}

export async function removePendingSync(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("pendingSync", id);
}

export async function clearPendingSync(): Promise<void> {
  const db = await getDB();
  await db.clear("pendingSync");
}

export async function getPendingSyncCount(): Promise<number> {
  const db = await getDB();
  return db.count("pendingSync");
}

// ══════════════ META ══════════════

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put("meta", { key, value });
}

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getDB();
  const item = await db.get("meta", key);
  return item?.value;
}
