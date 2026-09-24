/**
 * src/integrations/firebase/firestore.ts
 *
 * Firestore schema — typed collection/document reference helpers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COLLECTION STRUCTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  users/{userId}                          ← container (no direct read/write)
 *    profile                               ← DOCUMENT (single, fixed ID "profile")
 *    tasks/{taskId}                        ← COLLECTION
 *    documents/{docId}                     ← COLLECTION
 *    reminders/{remId}                     ← COLLECTION
 *    routines/{routineId}                  ← COLLECTION
 *      tasks/{taskId}                      ← SUB-COLLECTION
 *        slots/{slotId}                    ← SUB-COLLECTION
 *    docvault_categories/{catId}           ← COLLECTION
 *    notification_tokens/{tokenId}         ← COLLECTION
 *    onesignal_player_ids/{id}             ← COLLECTION
 *    learned_preferences                   ← DOCUMENT (single, fixed ID "learned_preferences")
 *    snooze_usage/{id}                     ← COLLECTION
 *    snooze_sync_queue/{id}                ← COLLECTION
 *
 *  organizations/{orgId}                   ← COLLECTION
 *    members/{memberId}                    ← SUB-COLLECTION  (memberId == userId)
 *
 *  document_history/{id}                   ← COLLECTION  (service-write only)
 *  audit_logs/{id}                         ← COLLECTION  (service-write only)
 *  routine_notification_log/{id}           ← COLLECTION  (service-write only)
 *  otp_codes/{id}                          ← COLLECTION  (service-only)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTE: Firestore creates collections lazily on first write.
 * This file only provides typed references — no data is created here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type DocumentData,
} from 'firebase/firestore';
import { firebaseDb } from './client';

// ─────────────────────────────────────────────────────────────────────────────
// Internal typed-reference factories
// ─────────────────────────────────────────────────────────────────────────────

function typedCollection<T extends DocumentData>(
  path: string,
  ...pathSegments: string[]
): CollectionReference<T> {
  return collection(firebaseDb, path, ...pathSegments) as CollectionReference<T>;
}

function typedDoc<T extends DocumentData>(
  path: string,
  ...pathSegments: string[]
): DocumentReference<T> {
  return doc(firebaseDb, path, ...pathSegments) as DocumentReference<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enums and union types
// ─────────────────────────────────────────────────────────────────────────────

/** All valid document types — mirrors the Supabase document_type enum. */
export type DocumentType =
  | 'license'
  | 'passport'
  | 'permit'
  | 'insurance'
  | 'certification'
  | 'other'
  | 'tickets_and_fines';

/** Organisation member roles — mirrors the Supabase app_role enum. */
export type AppRole = 'admin' | 'editor' | 'viewer';

/** Task status values. */
export type TaskStatus = 'pending' | 'completed' | 'carried';

/** Push notification token providers. */
export type NotificationProvider = 'onesignal' | 'fcm';

// ─────────────────────────────────────────────────────────────────────────────
// Document interfaces
// All fields are faithfully mapped from the Supabase schema audit.
// ISO-8601 strings are used for all date/time fields so documents are
// serialisable without Firestore Timestamp conversion at the boundary.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * users/{userId}/profile
 *
 * Single document (fixed ID "profile") per user.
 * Auto-created by the onUserCreate Cloud Function trigger.
 *
 * Mirrors: public.profiles (Supabase)
 */
export interface UserProfile {
  /** Firebase Auth UID — same as the parent userId path segment. */
  userId: string;
  /** Display name — set from auth.displayName or signup metadata. */
  displayName: string | null;
  /** Email address — copied from Firebase Auth on account creation. */
  email: string | null;
  /** E.164 phone number (e.g. "+911234567890"). */
  phoneNumber: string | null;
  /** Country name string (e.g. "India"). */
  country: string | null;
  /** IANA timezone identifier (e.g. "Asia/Kolkata"). */
  timezone: string | null;
  /** Local time for daily notifications — "HH:MM" 24-hour format. */
  preferredNotificationTime: string | null;
  /** Firebase Storage path to the user's avatar image. */
  avatarUrl: string | null;
  /** Whether email notifications are enabled. Defaults true. */
  emailNotificationsEnabled: boolean | null;
  /** Whether push notifications are enabled. Set true on first token registration. */
  pushNotificationsEnabled: boolean | null;
  /** Whether document expiry reminders are enabled. */
  expiryRemindersEnabled: boolean | null;
  /** Whether document renewal reminders are enabled. */
  renewalRemindersEnabled: boolean | null;
  /** Whether weekly digest emails are enabled. */
  weeklyDigestEnabled: boolean | null;
  /**
   * Per-notification-type sound preferences.
   * Shape: { task_reminder?: string; document_expiring?: string; ... }
   */
  notificationSounds: Record<string, string> | null;
  /** Whether the user has completed onboarding. */
  onboardingCompleted: boolean;
  /** Arbitrary onboarding step data collected during the flow. */
  onboardingPreferences: Record<string, unknown>;
  /** Theme and appearance preferences (palette, mode, etc.). */
  themePreference: Record<string, unknown>;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/**
 * users/{userId}/tasks/{taskId}
 *
 * A daily task with carry-forward logic, timezone support, and reminder tracking.
 *
 * Mirrors: public.tasks (Supabase)
 */
export interface FirestoreTask {
  /** Firestore document ID — same as the taskId path segment. */
  id: string;
  /** Owner's Firebase Auth UID. */
  userId: string;
  /** Task title — required. */
  title: string;
  /** Optional free-text description. */
  description: string | null;
  /** ISO-8601 datetime when the task starts. */
  startTime: string;
  /** ISO-8601 datetime when the task ends (optional). */
  endTime: string | null;
  /** Total estimated duration in minutes. */
  totalTimeMinutes: number | null;
  /** Current status. */
  status: TaskStatus;
  /** Firebase Storage path to an attached image. */
  imagePath: string | null;
  /** IANA timezone of the user at task-creation time. */
  timezone: string;
  /** How many consecutive days the task has been carried forward without completion. */
  consecutiveMissedDays: number;
  /** YYYY-MM-DD — the original date this task was created for (never changes). */
  originalDate: string;
  /** YYYY-MM-DD — current scheduled date (updated by task-carry-forward). */
  taskDate: string;
  /** YYYY-MM-DD in the user's local timezone — derived from taskDate + timezone. */
  localDate: string | null;
  /** Whether push reminders are active for this task. */
  reminderActive: boolean | null;
  /** True after the start-time notification has been sent. */
  startNotified: boolean | null;
  /** ISO-8601 timestamp of the last reminder sent. */
  lastReminderSentAt: string | null;
  /** YYYY-MM-DD — date the last overdue alert was sent (dedup key). */
  lastOverdueAlertSent: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/**
 * users/{userId}/documents/{docId}
 *
 * A user's managed document (license, passport, insurance, etc.).
 * Documents with issuingAuthority === "DocVault" are DocVault items.
 *
 * Mirrors: public.documents (Supabase)
 */
export interface FirestoreDocument {
  /** Firestore document ID. */
  id: string;
  /** Owner's Firebase Auth UID. */
  userId: string;
  /** Document name / label. */
  name: string;
  /** Classified document type. */
  documentType: DocumentType;
  /** Issuing authority or organisation name. "DocVault" for DocVault items. */
  issuingAuthority: string | null;
  /** YYYY-MM-DD expiry date. Nullable for documents without a fixed expiry. */
  expiryDate: string | null;
  /** Human-readable expiry label as printed on the document (e.g. "15 MAY 2028"). */
  expiryDateLabel: string | null;
  /** Recommended renewal lead time in days. Default 30. */
  renewalPeriodDays: number | null;
  /** Free-text notes. Max 5000 characters. */
  notes: string | null;
  /** Firebase Storage path to the document image / PDF. */
  imagePath: string | null;
  /** Org ID if this document is shared with an organisation. */
  organizationId: string | null;
  /** DocVault category ID (references docvault_categories). */
  docvaultCategoryId: string | null;
  /** Number of times this document has been accessed (DocVault tracking). */
  accessCount: number | null;
  /** ISO-8601 timestamp of last access (DocVault). */
  lastAccessedAt: string | null;
  /** Sub-category detail string (e.g. "third-party liability"). */
  categoryDetail: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/**
 * users/{userId}/reminders/{remId}
 *
 * Expiry reminders for documents.
 * Auto-created by onDocumentWrite trigger at 30/14/7/3/1 days before expiry.
 *
 * Mirrors: public.reminders (Supabase)
 */
export interface FirestoreReminder {
  /** Firestore document ID. */
  id: string;
  /** Parent document ID. */
  documentId: string;
  /** Owner's Firebase Auth UID. */
  userId: string;
  /** YYYY-MM-DD — date on which this reminder should fire. */
  reminderDate: string;
  /** True once the reminder notification has been sent. */
  isSent: boolean;
  /** True if the reminder was created manually rather than auto-generated. */
  isCustom: boolean | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/**
 * users/{userId}/routines/{routineId}
 *
 * A named routine container (e.g. "Morning Routine").
 *
 * Mirrors: public.routines (Supabase v2 schema)
 */
export interface FirestoreRoutine {
  /** Firestore document ID. */
  id: string;
  /** Owner's Firebase Auth UID. */
  userId: string;
  /** Routine name. */
  name: string;
  /** Emoji or icon identifier (e.g. "☀️"). */
  icon: string | null;
  /** Whether this routine is currently active (sends notifications). */
  isActive: boolean | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/**
 * users/{userId}/routines/{routineId}/tasks/{taskId}
 *
 * A task within a routine.
 *
 * Mirrors: public.routine_tasks (Supabase)
 */
export interface FirestoreRoutineTask {
  /** Firestore document ID. */
  id: string;
  /** Parent routine ID. */
  routineId: string;
  /** Task name. */
  name: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/**
 * users/{userId}/routines/{routineId}/tasks/{taskId}/slots/{slotId}
 *
 * A time+day schedule slot for a routine task.
 *
 * Mirrors: public.routine_task_slots (Supabase)
 */
export interface FirestoreRoutineTaskSlot {
  /** Firestore document ID. */
  id: string;
  /** Parent routine task ID. */
  taskId: string;
  /** Local wall-clock time — "HH:MM" 24-hour format. */
  time: string;
  /**
   * Days of week this slot is active.
   * Values: 1 = Monday … 7 = Sunday (ISO week day convention).
   */
  daysOfWeek: number[];
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/**
 * users/{userId}/docvault_categories/{catId}
 *
 * User-created categories for grouping DocVault documents.
 *
 * Mirrors: public.docvault_categories (Supabase)
 */
export interface FirestoreDocvaultCategory {
  /** Firestore document ID. */
  id: string;
  /** Owner's Firebase Auth UID. */
  userId: string;
  /** Category name. */
  name: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/**
 * users/{userId}/notification_tokens/{tokenId}
 *
 * Primary push notification token store.
 * tokenId === token value for easy upsert/dedup.
 *
 * Mirrors: public.notification_tokens (Supabase)
 */
export interface FirestoreNotificationToken {
  /** Token value (also the Firestore document ID). */
  id: string;
  /** Owner's Firebase Auth UID. */
  userId: string;
  /** The subscription / player / registration token. */
  token: string;
  /** Which push provider issued this token. */
  provider: NotificationProvider;
  /** Platform and user-agent string (truncated to 400 chars). */
  deviceInfo: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp (refreshed on each upsert). */
  updatedAt: string;
}

/**
 * users/{userId}/onesignal_player_ids/{id}
 *
 * Legacy / backup OneSignal subscription ID store.
 * Kept alongside notification_tokens for dual-table dedup in the push sender.
 *
 * Mirrors: public.onesignal_player_ids (Supabase)
 */
export interface FirestoreOnesignalPlayerId {
  /** Firestore document ID. */
  id: string;
  /** Owner's Firebase Auth UID. */
  userId: string;
  /** OneSignal subscription / player ID. */
  playerId: string;
  /** Platform and user-agent string. */
  deviceInfo: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/**
 * users/{userId}/learned_preferences
 *
 * Single document (fixed ID "learned_preferences") per user.
 * Stores arbitrary AI/preference learning data as a JSON blob.
 *
 * Mirrors: public.learned_preferences (Supabase)
 */
export interface FirestoreLearnedPreferences {
  /** Owner's Firebase Auth UID. */
  userId: string;
  /** Arbitrary preference data blob. */
  data: Record<string, unknown>;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/**
 * users/{userId}/snooze_usage/{id}
 *
 * Statistics on snooze duration preferences per user.
 *
 * Mirrors: public.snooze_usage (Supabase)
 */
export interface FirestoreSnoozeUsage {
  /** Firestore document ID. */
  id: string;
  /** Owner's Firebase Auth UID. */
  userId: string;
  /** Snooze duration in minutes. */
  durationMinutes: number;
  /** How many times this duration has been used. */
  usedCount: number;
  /** ISO-8601 timestamp of last use. */
  lastUsedAt: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/**
 * users/{userId}/snooze_sync_queue/{id}
 *
 * Offline snooze actions queued for server sync.
 *
 * Mirrors: public.snooze_sync_queue (Supabase)
 */
export interface FirestoreSnoozeSyncQueue {
  /** Firestore document ID. */
  id: string;
  /** Owner's Firebase Auth UID. */
  userId: string;
  /** Reminder instance ID (if applicable). */
  instanceId: string | null;
  /** Action type (e.g. "snooze", "complete"). */
  action: string;
  /** Serialised action payload. */
  payload: Record<string, unknown>;
  /** ISO-8601 client-side event timestamp. */
  clientEventAt: string;
  /** Whether this queue item has been processed by the server. */
  processed: boolean;
  /** ISO-8601 timestamp when the server processed this item. */
  processedAt: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/**
 * organizations/{orgId}
 *
 * Multi-user document-sharing organisation.
 *
 * Mirrors: public.organizations (Supabase)
 */
export interface FirestoreOrganization {
  /** Firestore document ID. */
  id: string;
  /** Organisation display name. */
  name: string;
  /** Firebase Auth UID of the owner. */
  ownerId: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-update timestamp. */
  updatedAt: string;
}

/**
 * organizations/{orgId}/members/{memberId}
 *
 * Organisation membership with role.
 * memberId is always the member's Firebase Auth UID.
 *
 * Mirrors: public.organization_members (Supabase)
 */
export interface FirestoreOrganizationMember {
  /** Firestore document ID (= the member's Firebase Auth UID). */
  id: string;
  /** Parent organisation ID. */
  organizationId: string;
  /** Member's Firebase Auth UID. */
  userId: string;
  /** Member's role in this organisation. */
  role: AppRole;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/**
 * document_history/{id}
 *
 * Immutable audit trail of document expiry date changes.
 * Written exclusively by the onDocumentWrite Cloud Function trigger.
 * Clients have read-only access filtered by userId.
 *
 * Mirrors: public.document_history (Supabase)
 */
export interface FirestoreDocumentHistory {
  /** Firestore document ID. */
  id: string;
  /** Document ID that was changed. */
  documentId: string;
  /** Firebase Auth UID of the user who owns the document. */
  userId: string;
  /** Action type: "created" | "updated" | "deleted" | "expiry_updated". */
  action: string;
  /** Previous expiry date (YYYY-MM-DD), or null if not applicable. */
  oldExpiryDate: string | null;
  /** New expiry date (YYYY-MM-DD), or null if not applicable. */
  newExpiryDate: string | null;
  /** Optional human-readable note. */
  notes: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/**
 * audit_logs/{id}
 *
 * Immutable audit log of all document CRUD and organisation role-change events.
 * Written exclusively by Cloud Function triggers.
 * Clients have read-only access filtered by userId.
 * No client can create, update, or delete audit log entries.
 *
 * Mirrors: public.audit_logs (Supabase)
 */
export interface FirestoreAuditLog {
  /** Firestore document ID. */
  id: string;
  /** Firebase Auth UID of the user whose action is being logged. */
  userId: string;
  /** Document ID (if action is document-related), or null. */
  documentId: string | null;
  /** Entity type: "document" | "organization_member". */
  entityType: string;
  /** Action performed: "created" | "updated" | "deleted" | "role_change". */
  action: string;
  /**
   * Field-level change diff.
   * Shape: { fieldName: { before: unknown; after: unknown } }
   */
  changes: Record<string, unknown> | null;
  /** Client IP address (best-effort, may be null). */
  ipAddress: string | null;
  /** Client user-agent string (best-effort, may be null). */
  userAgent: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/**
 * routine_notification_log/{id}
 *
 * Deduplication log for routine push notifications.
 * Written and cleaned up exclusively by the routineStepReminder Cloud Function.
 * No client access.
 *
 * Mirrors: public.routine_notification_log (Supabase)
 */
export interface FirestoreRoutineNotificationLog {
  /** Firestore document ID. */
  id: string;
  /**
   * Unique dedup key — prevents sending the same notification twice.
   * Format: "{routineId}_{slotId}_{HH:MM}"
   */
  notificationKey: string;
  /** User whose routine generated this notification. */
  userId: string;
  /** Routine ID. */
  routineId: string;
  /** Slot / step ID, or null for routine-level notifications. */
  stepId: string | null;
  /** Notification sub-type: "slot_start" | "nudge" | "preview" | "completed". */
  notificationType: string;
  /** ISO-8601 timestamp when the notification was sent. */
  sentAt: string;
}

/**
 * otp_codes/{id}
 *
 * Temporary OTP storage with rate-limiting fields.
 * No client access — service-only via Admin SDK.
 *
 * Mirrors: public.otp_codes (Supabase)
 */
export interface FirestoreOtpCode {
  /** Firestore document ID. */
  id: string;
  /** E.164 phone number the OTP was issued for. */
  phoneNumber: string;
  /** Firebase Auth UID of the user (may be null for pre-signup OTPs). */
  userId: string | null;
  /** BCrypt/SHA-256 hash of the OTP code (never store plaintext). */
  otpHash: string | null;
  /** Purpose: "verification" (default) or other custom purpose. */
  purpose: string;
  /** ISO-8601 expiry timestamp (typically +10 minutes from creation). */
  expiresAt: string;
  /** True once the OTP has been successfully verified. */
  isVerified: boolean | null;
  /** ISO-8601 timestamp when the OTP was consumed (verified or expired). */
  consumedAt: string | null;
  /** Delivery status: "pending" | "sent" | "failed". */
  deliveryStatus: string;
  /** Error message if delivery failed. */
  deliveryError: string | null;
  /** Number of failed verification attempts (brute-force counter). */
  failedAttempts: number | null;
  /** ISO-8601 timestamp of the last OTP send for this phone number. */
  lastOtpSentAt: string | null;
  /** ISO-8601 timestamp until which the account is locked out. */
  lockedUntil: string | null;
  /** Requesting IP address (for IP-based rate limiting). */
  ipAddress: string | null;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection / document reference helpers
// ─────────────────────────────────────────────────────────────────────────────
// All helpers are pure functions — they build typed Firestore references
// without making any network calls.

// ── Profile (single document per user) ───────────────────────────────────────
/**
 * Reference to users/{userId}/profile/data
 *
 * Path breakdown (Firestore requires alternating collection/document segments):
 *   collection "users"  → document userId  → sub-collection "profile"  → document "data"
 *
 * This matches the path written by the onUserCreate Cloud Function trigger.
 * The sub-collection name "profile" enables collectionGroup('profile') queries
 * in Cloud Functions schedulers.
 */
export const userProfileDoc = (userId: string) =>
  typedDoc<UserProfile>('users', userId, 'profile', 'data');

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const tasksCollection = (userId: string) =>
  typedCollection<FirestoreTask>('users', userId, 'tasks');

export const taskDoc = (userId: string, taskId: string) =>
  typedDoc<FirestoreTask>('users', userId, 'tasks', taskId);

// ── Documents ─────────────────────────────────────────────────────────────────
export const documentsCollection = (userId: string) =>
  typedCollection<FirestoreDocument>('users', userId, 'documents');

export const documentDoc = (userId: string, docId: string) =>
  typedDoc<FirestoreDocument>('users', userId, 'documents', docId);

// ── Reminders ─────────────────────────────────────────────────────────────────
export const remindersCollection = (userId: string) =>
  typedCollection<FirestoreReminder>('users', userId, 'reminders');

export const reminderDoc = (userId: string, remId: string) =>
  typedDoc<FirestoreReminder>('users', userId, 'reminders', remId);

// ── Routines ──────────────────────────────────────────────────────────────────
export const routinesCollection = (userId: string) =>
  typedCollection<FirestoreRoutine>('users', userId, 'routines');

export const routineDoc = (userId: string, routineId: string) =>
  typedDoc<FirestoreRoutine>('users', userId, 'routines', routineId);

export const routineTasksCollection = (userId: string, routineId: string) =>
  typedCollection<FirestoreRoutineTask>('users', userId, 'routines', routineId, 'tasks');

export const routineTaskDoc = (userId: string, routineId: string, taskId: string) =>
  typedDoc<FirestoreRoutineTask>('users', userId, 'routines', routineId, 'tasks', taskId);

export const routineTaskSlotsCollection = (
  userId: string, routineId: string, taskId: string
) =>
  typedCollection<FirestoreRoutineTaskSlot>(
    'users', userId, 'routines', routineId, 'tasks', taskId, 'slots'
  );

export const routineTaskSlotDoc = (
  userId: string, routineId: string, taskId: string, slotId: string
) =>
  typedDoc<FirestoreRoutineTaskSlot>(
    'users', userId, 'routines', routineId, 'tasks', taskId, 'slots', slotId
  );

// ── DocVault Categories ────────────────────────────────────────────────────────
export const docvaultCategoriesCollection = (userId: string) =>
  typedCollection<FirestoreDocvaultCategory>('users', userId, 'docvault_categories');

export const docvaultCategoryDoc = (userId: string, catId: string) =>
  typedDoc<FirestoreDocvaultCategory>('users', userId, 'docvault_categories', catId);

// ── Notification Tokens ────────────────────────────────────────────────────────
export const notificationTokensCollection = (userId: string) =>
  typedCollection<FirestoreNotificationToken>('users', userId, 'notification_tokens');

export const notificationTokenDoc = (userId: string, tokenId: string) =>
  typedDoc<FirestoreNotificationToken>('users', userId, 'notification_tokens', tokenId);

// ── OneSignal Player IDs (legacy) ─────────────────────────────────────────────
export const onesignalPlayerIdsCollection = (userId: string) =>
  typedCollection<FirestoreOnesignalPlayerId>('users', userId, 'onesignal_player_ids');

export const onesignalPlayerIdDoc = (userId: string, id: string) =>
  typedDoc<FirestoreOnesignalPlayerId>('users', userId, 'onesignal_player_ids', id);

// ── Learned Preferences (single document per user) ───────────────────────────
/**
 * Reference to users/{userId}/learned_preferences/data
 * Sub-collection "learned_preferences", document "data".
 */
export const learnedPreferencesDoc = (userId: string) =>
  typedDoc<FirestoreLearnedPreferences>('users', userId, 'learned_preferences', 'data');

// ── Snooze Usage ──────────────────────────────────────────────────────────────
export const snoozeUsageCollection = (userId: string) =>
  typedCollection<FirestoreSnoozeUsage>('users', userId, 'snooze_usage');

export const snoozeUsageDoc = (userId: string, id: string) =>
  typedDoc<FirestoreSnoozeUsage>('users', userId, 'snooze_usage', id);

// ── Snooze Sync Queue ─────────────────────────────────────────────────────────
export const snoozeSyncQueueCollection = (userId: string) =>
  typedCollection<FirestoreSnoozeSyncQueue>('users', userId, 'snooze_sync_queue');

export const snoozeSyncQueueDoc = (userId: string, id: string) =>
  typedDoc<FirestoreSnoozeSyncQueue>('users', userId, 'snooze_sync_queue', id);

// ── Organisations ─────────────────────────────────────────────────────────────
export const organizationsCollection = () =>
  typedCollection<FirestoreOrganization>('organizations');

export const organizationDoc = (orgId: string) =>
  typedDoc<FirestoreOrganization>('organizations', orgId);

export const orgMembersCollection = (orgId: string) =>
  typedCollection<FirestoreOrganizationMember>('organizations', orgId, 'members');

export const orgMemberDoc = (orgId: string, memberId: string) =>
  typedDoc<FirestoreOrganizationMember>('organizations', orgId, 'members', memberId);

// ── Global read-only collections (service-write, owner-read) ──────────────────
export const documentHistoryCollection = () =>
  typedCollection<FirestoreDocumentHistory>('document_history');

export const documentHistoryDoc = (id: string) =>
  typedDoc<FirestoreDocumentHistory>('document_history', id);

export const auditLogsCollection = () =>
  typedCollection<FirestoreAuditLog>('audit_logs');

export const auditLogDoc = (id: string) =>
  typedDoc<FirestoreAuditLog>('audit_logs', id);

// ── Service-only collections (no client access) ───────────────────────────────
export const otpCodesCollection = () =>
  typedCollection<FirestoreOtpCode>('otp_codes');

export const routineNotificationLogCollection = () =>
  typedCollection<FirestoreRoutineNotificationLog>('routine_notification_log');
