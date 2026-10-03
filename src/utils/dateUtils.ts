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
