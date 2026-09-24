/**
 * functions/src/shared/types.ts
 *
 * Shared type definitions for Cloud Functions (server-side).
 *
 * These interfaces are the canonical server-side equivalent of the
 * client-side types in src/integrations/firebase/firestore.ts.
 * They are identical in shape — both files must be kept in sync.
 *
 * ISO-8601 strings are used for all date/time fields. Firestore
 * Timestamps are only used at the Admin SDK boundary (FieldValue.serverTimestamp)
 * and converted to ISO strings before being stored.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enum / union types
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentType =
  | 'license'
  | 'passport'
  | 'permit'
  | 'insurance'
  | 'certification'
  | 'other'
  | 'tickets_and_fines';

export type AppRole = 'admin' | 'editor' | 'viewer';
export type TaskStatus = 'pending' | 'completed' | 'carried';
export type NotificationProvider = 'onesignal' | 'fcm';

// ─────────────────────────────────────────────────────────────────────────────
// User-scoped document types
// ─────────────────────────────────────────────────────────────────────────────

export interface UserProfile {
  userId: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  country: string | null;
  timezone: string | null;
  preferredNotificationTime: string | null;
  avatarUrl: string | null;
  emailNotificationsEnabled: boolean | null;
  pushNotificationsEnabled: boolean | null;
  expiryRemindersEnabled: boolean | null;
  renewalRemindersEnabled: boolean | null;
  weeklyDigestEnabled: boolean | null;
  notificationSounds: Record<string, string> | null;
  onboardingCompleted: boolean;
  onboardingPreferences: Record<string, unknown>;
  themePreference: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreTask {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  totalTimeMinutes: number | null;
  status: TaskStatus;
  imagePath: string | null;
  timezone: string;
  consecutiveMissedDays: number;
  originalDate: string;
  taskDate: string;
  localDate: string | null;
  reminderActive: boolean | null;
  startNotified: boolean | null;
  lastReminderSentAt: string | null;
  lastOverdueAlertSent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreDocument {
  id: string;
  userId: string;
  name: string;
  documentType: DocumentType;
  issuingAuthority: string | null;
  expiryDate: string | null;
  expiryDateLabel: string | null;
  renewalPeriodDays: number | null;
  notes: string | null;
  imagePath: string | null;
  organizationId: string | null;
  docvaultCategoryId: string | null;
  accessCount: number | null;
  lastAccessedAt: string | null;
  categoryDetail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreReminder {
  id: string;
  documentId: string;
  userId: string;
  reminderDate: string;
  isSent: boolean;
  isCustom: boolean | null;
  createdAt: string;
}

export interface FirestoreRoutine {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  isActive: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreRoutineTask {
  id: string;
  routineId: string;
  name: string;
  createdAt: string;
}

export interface FirestoreRoutineTaskSlot {
  id: string;
  taskId: string;
  /** "HH:MM" 24-hour local wall-clock time */
  time: string;
  /** 1 = Monday … 7 = Sunday */
  daysOfWeek: number[];
  createdAt: string;
}

export interface FirestoreDocvaultCategory {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreNotificationToken {
  id: string;
  userId: string;
  token: string;
  provider: NotificationProvider;
  deviceInfo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreOnesignalPlayerId {
  id: string;
  userId: string;
  playerId: string;
  deviceInfo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreLearnedPreferences {
  userId: string;
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface FirestoreSnoozeUsage {
  id: string;
  userId: string;
  durationMinutes: number;
  usedCount: number;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreSnoozeSyncQueue {
  id: string;
  userId: string;
  instanceId: string | null;
  action: string;
  payload: Record<string, unknown>;
  clientEventAt: string;
  processed: boolean;
  processedAt: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Organisation types
// ─────────────────────────────────────────────────────────────────────────────

export interface FirestoreOrganization {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreOrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: AppRole;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Global / service-only collection types
// ─────────────────────────────────────────────────────────────────────────────

export interface FirestoreDocumentHistory {
  id: string;
  documentId: string;
  userId: string;
  action: string;
  oldExpiryDate: string | null;
  newExpiryDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface FirestoreAuditLog {
  id: string;
  userId: string;
  documentId: string | null;
  entityType: string;
  action: string;
  changes: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface FirestoreRoutineNotificationLog {
  id: string;
  notificationKey: string;
  userId: string;
  routineId: string;
  stepId: string | null;
  notificationType: string;
  sentAt: string;
}

export interface FirestoreOtpCode {
  id: string;
  phoneNumber: string;
  userId: string | null;
  otpHash: string | null;
  purpose: string;
  expiresAt: string;
  isVerified: boolean | null;
  consumedAt: string | null;
  deliveryStatus: string;
  deliveryError: string | null;
  failedAttempts: number | null;
  lastOtpSentAt: string | null;
  lockedUntil: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification payload types (used by onesignal.ts and all notification senders)
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationButton {
  id: string;
  text: string;
  icon?: string;
}

export interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
  buttons?: NotificationButton[];
  url?: string;
}

export interface OneSignalResult {
  success: boolean;
  reason?: 'no_credentials' | 'no_targets' | 'rejected' | 'error' | 'timeout';
  detail?: string;
  notificationId?: string;
  targets?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic API response wrapper
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
