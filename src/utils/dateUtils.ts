/**
 * Unified timezone and date utilities for the entire app.
 * All date/time conversions should use these functions.
 */

import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { format, addHours, addMinutes, differenceInMinutes } from "date-fns";

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
  const localDate = convertUtcToLocal(date, timezone);
  return format(localDate, formatStr);
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
 * Parse datetime-local input (YYYY-MM-DDTHH:mm) and convert to UTC
 */
export function parseLocalInputToUtc(
  datetimeLocalInput: string,
  timezone: string
): Date {
  const [dateStr, timeStr] = datetimeLocalInput.split("T");
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  
  // Create date in user's local timezone
  const localDateTime = new Date(year, month - 1, day, hours, minutes);
  
  // Convert to UTC
  return convertLocalToUtc(localDateTime, timezone);
}

/**
 * Convert UTC timestamp to datetime-local input format (YYYY-MM-DDTHH:mm)
 */
export function formatUtcForLocalInput(
  utcDate: Date | string,
  timezone: string
): string {
  const localDate = convertUtcToLocal(utcDate, timezone);
  return format(localDate, "yyyy-MM-dd'T'HH:mm");
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
  const localDate = convertUtcToLocal(targetDate, timezone);
  return format(localDate, "yyyy-MM-dd");
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
