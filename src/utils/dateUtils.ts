/**
 * Unified timezone and date utilities for the entire app.
 * All date/time conversions should use these functions.
 */

import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { addHours, addMinutes, differenceInMinutes } from "date-fns";

/**
 * Convert UTC timestamp to user's local timezone
 */
export function convertUtcToLocal(utcDate: Date | string, timezone: string): Date {
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  return toZonedTime(date, timezone);
}

/**
 * Convert local time to UTC for storage
 */
export function convertLocalToUtc(localDate: Date, timezone: string): Date {
  return fromZonedTime(localDate, timezone);
}

/**
 * Format a UTC timestamp in user's local timezone
 */
export function formatInTimezone(
  date: Date | string,
  timezone: string,
  formatStr: string = "yyyy-MM-dd HH:mm"
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, timezone || "UTC", formatStr);
}

/**
 * Get current time in user's local timezone
 */
export function getCurrentLocalTime(timezone: string): Date {
  return convertUtcToLocal(new Date(), timezone);
}

/**
 * Get current time as formatted string in user's local timezone
 */
export function getCurrentLocalTimeString(
  timezone: string,
  formatStr: string = "HH:mm"
): string {
  return formatInTimezone(new Date(), timezone, formatStr);
}

/**
 * Parse datetime-local input (YYYY-MM-DDTHH:mm or YYYY-MM-DD + HH:mm) and convert to UTC
 */
export function parseLocalInputToUtc(
  datetimeLocalInput: string,
  timezone: string
): Date {
  if (!datetimeLocalInput) return new Date();
  let dateStr = "";
  let timeStr = "";

  if (datetimeLocalInput.includes("T")) {
    [dateStr, timeStr] = datetimeLocalInput.split("T");
  } else if (datetimeLocalInput.includes(" ")) {
    [dateStr, timeStr] = datetimeLocalInput.split(" ");
  } else {
    dateStr = datetimeLocalInput;
    timeStr = "00:00";
  }

  const cleanDate = dateStr.trim();
  const cleanTime = timeStr ? timeStr.trim().slice(0, 5) : "00:00";
  
  // Directly interpret ISO wall-clock string in the given user timezone
  return fromZonedTime(`${cleanDate}T${cleanTime}:00`, timezone || "UTC");
}

/**
 * Convert UTC timestamp to datetime-local input format (YYYY-MM-DDTHH:mm)
 */
export function formatUtcForLocalInput(
  utcDate: Date | string,
  timezone: string
): string {
  if (!utcDate) return "";
  const d = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  return formatInTimeZone(d, timezone || "UTC", "yyyy-MM-dd'T'HH:mm");
}

/**
 * Calculate duration between two UTC timestamps in minutes
 */
export function calculateDurationMinutes(
  startUtc: Date | string,
  endUtc: Date | string
): number {
  const start = typeof startUtc === "string" ? new Date(startUtc) : startUtc;
  const end = typeof endUtc === "string" ? new Date(endUtc) : endUtc;
  
  const minutes = differenceInMinutes(end, start);
  return minutes < 0 ? 0 : minutes;
}

/**
 * Format duration in minutes to human-readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
    return `${hours} ${hours === 1 ? "hour" : "hours"} ${mins} ${
      mins === 1 ? "minute" : "minutes"
    }`;
  }
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/**
 * Get next reminder time for a task (first = start time, then +2 hours from last)
 */
export function getTaskNextReminder(
  startTimeUtc: string,
  lastReminderUtc: string | null,
  timezone: string
): Date {
  if (!lastReminderUtc) {
    // First reminder: at start time (in local timezone)
    return convertUtcToLocal(startTimeUtc, timezone);
  }
  
  // Subsequent reminders: 2 hours after last reminder (in UTC)
  const lastReminderDate = new Date(lastReminderUtc);
  const nextReminderUtc = addHours(lastReminderDate, 2);
  return convertUtcToLocal(nextReminderUtc, timezone);
}

/**
 * Check if current time matches target time (with window in minutes)
 */
export function isTimeMatching(
  currentTime: Date,
  targetTime: string,
  windowMinutes: number = 2
): boolean {
  const [targetHour, targetMinute] = targetTime.split(":").map(Number);
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  
  return (
    currentHour === targetHour &&
    currentMinute >= targetMinute &&
    currentMinute < targetMinute + windowMinutes
  );
}

/**
 * Get date in YYYY-MM-DD format for a given timezone
 */
export function getDateInTimezone(timezone: string, date?: Date): string {
  const targetDate = date || new Date();
  return formatInTimeZone(targetDate, timezone || "UTC", "yyyy-MM-dd");
}

/**
 * Check if a task should receive its first notification
 */
export function shouldSendFirstNotification(
  startTimeUtc: string,
  timezone: string,
  lastReminderSentAt: string | null
): boolean {
  if (lastReminderSentAt !== null) return false;
  
  const nowLocal = getCurrentLocalTime(timezone);
  const startLocal = convertUtcToLocal(startTimeUtc, timezone);
  
  return nowLocal >= startLocal;
}

/**
 * Check if a task should receive a recurring (2-hour) notification
 */
export function shouldSendRecurringNotification(
  lastReminderUtc: string,
  timezone: string
): boolean {
  const nowUtc = new Date();
  const lastReminderDate = new Date(lastReminderUtc);
  const nextReminderUtc = addHours(lastReminderDate, 2);
  
  return nowUtc >= nextReminderUtc;
}

/**
 * Normalizes a 12-hour or 24-hour time string into "HH:mm:ss".
 * Handles "3:42 PM", "03:42 pm", "15:42", "15:42:00", etc.
 */
export function normalizeTimeTo24h(timeStr: string): string | null {
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const seconds = match[3] || '00';
  const modifier = match[4]?.toLowerCase();
  if (modifier === 'pm' && hours < 12) hours += 12;
  if (modifier === 'am' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
}

/**
 * Combine separate date and time strings into a timezone-aware Date object.
 */
export function combineDateAndTime(
  dateStr: string,
  timeStr: string,
  timezone: string = 'UTC'
): Date | null {
  const cleanDate = dateStr.trim();
  const cleanTime = normalizeTimeTo24h(timeStr);
  if (!cleanTime) return null;
  try {
    const wallClock = `${cleanDate}T${cleanTime}`;
    const d = fromZonedTime(wallClock, timezone || 'UTC');
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Helper to parse a date/time value (Date, number, Firestore Timestamp, or string)
 * into a millisecond timestamp or evaluate date-only strings against today's date.
 */
function parseTimestampOrDate(
  val: unknown,
  todayStr: string,
  nowMs: number
): { hasValue: boolean; isOverdue: boolean } {
  if (val === null || val === undefined || val === '') {
    return { hasValue: false, isOverdue: false };
  }
  if (val instanceof Date) {
    const ms = val.getTime();
    return { hasValue: !isNaN(ms), isOverdue: !isNaN(ms) && nowMs > ms };
  }
  if (typeof val === 'number') {
    return { hasValue: !isNaN(val), isOverdue: !isNaN(val) && nowMs > val };
  }
  if (
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    const ms = (val as { toDate: () => Date }).toDate().getTime();
    return { hasValue: !isNaN(ms), isOverdue: !isNaN(ms) && nowMs > ms };
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return { hasValue: false, isOverdue: false };
    // Date-only string (YYYY-MM-DD): overdue only when the date is strictly before today
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { hasValue: true, isOverdue: trimmed < todayStr };
    }
    const ms = new Date(trimmed).getTime();
    if (!isNaN(ms)) {
      return { hasValue: true, isOverdue: nowMs > ms };
    }
  }
  return { hasValue: false, isOverdue: false };
}

/**
 * Determine if a task is overdue according to Remonk Reminder canonical rules:
 * A task is overdue only when its actual due timestamp is earlier than the current
 * timestamp (nowMs > dueTimestamp) and it is not completed, cancelled, or rejected.
 *
 * Boundary rules:
 * - Before due time: not overdue (nowMs <= dueMs)
 * - Exactly at due time: not overdue under strict rule (nowMs <= dueMs)
 * - After due time: overdue (nowMs > dueMs)
 * - Completed, Cancelled, and Rejected tasks: never overdue
 * - A future due date/time strictly overrides any previously persisted 'overdue' status.
 * - If due_date and due_time are separate fields, they are combined into the timezone-aware due timestamp.
 * - Legacy fallback: never use start_time alone to mark an active task overdue; preserve existing status.
 */
export function isTaskOverdue(
  task: {
    status?: string | null;
    start_time?: unknown;
    startTime?: unknown;
    due_date?: unknown;
    dueDate?: unknown;
    due_time?: unknown;
    dueTime?: unknown;
    timezone?: string | null;
    task_date?: string | null;
    taskDate?: string | null;
    consecutive_missed_days?: number | null;
    consecutiveMissedDays?: number | null;
  } | null | undefined,
  todayDateStr?: string,
  nowMs: number = Date.now()
): boolean {
  if (!task) return false;

  // 1. Terminal tasks are never overdue
  const status = typeof task.status === 'string' ? task.status.toLowerCase().trim() : '';
  if (['completed', 'cancelled', 'rejected'].includes(status)) {
    return false;
  }

  const today =
    todayDateStr ||
    (() => {
      const d = new Date(nowMs);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();

  const rawDueDate = task.due_date ?? task.dueDate;
  const rawDueTime = task.due_time ?? task.dueTime;
  const tz = (task.timezone as string) || 'UTC';

  // 2. Separate due_date and due_time fields: combine into timezone-aware due timestamp
  if (
    typeof rawDueDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(rawDueDate.trim()) &&
    typeof rawDueTime === 'string' &&
    rawDueTime.trim()
  ) {
    const combinedDate = combineDateAndTime(rawDueDate, rawDueTime, tz);
    if (combinedDate) {
      return nowMs > combinedDate.getTime();
    }
  }

  // If due_time exists with task_date (without separate due_date)
  const rawTaskDate = task.task_date ?? task.taskDate;
  if (
    !rawDueDate &&
    typeof rawTaskDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(rawTaskDate.trim()) &&
    typeof rawDueTime === 'string' &&
    rawDueTime.trim()
  ) {
    const combinedDate = combineDateAndTime(rawTaskDate, rawDueTime, tz);
    if (combinedDate) {
      return nowMs > combinedDate.getTime();
    }
  }

  // 3. Explicit due date / due timestamp is canonical.
  // When specified, it alone determines overdue status.
  const dueResult = parseTimestampOrDate(rawDueDate, today, nowMs);
  if (dueResult.hasValue) {
    return dueResult.isOverdue;
  }

  // 4. Fallback for legacy tasks without a reliable due timestamp:
  // Never use start_time alone to classify an active task as overdue.
  // Preserve existing status rather than inventing a deadline.
  if (status === 'overdue') {
    return true;
  }
  const missedDays = task.consecutive_missed_days ?? task.consecutiveMissedDays;
  if (typeof missedDays === 'number' && missedDays > 0) {
    return true;
  }
  if (rawTaskDate && typeof rawTaskDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawTaskDate.trim())) {
    return rawTaskDate.trim() < today;
  }

  return false;
}

