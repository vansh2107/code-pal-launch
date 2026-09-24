/**
 * Timezone utilities.
 *
 * Direct port of supabase/functions/_shared/timezone.ts using date-fns-tz.
 * Behaviour is identical so scheduled functions produce the same results
 * after migration.
 */

import {
  format,
  toZonedTime,
  fromZonedTime,
} from 'date-fns-tz';
import { addMinutes, parseISO } from 'date-fns';

/**
 * Convert a UTC Date/ISO string to the equivalent local Date in a given
 * IANA timezone.
 */
export function convertUtcToLocal(utcDate: Date | string, timezone: string): Date {
  const date = typeof utcDate === 'string' ? parseISO(utcDate) : utcDate;
  return toZonedTime(date, timezone);
}

/**
 * Convert a local Date (interpreted in the given timezone) to UTC.
 */
export function convertLocalToUtc(localDate: Date, timezone: string): Date {
  return fromZonedTime(localDate, timezone);
}

/**
 * Format a UTC date as a string in the user's local timezone.
 */
export function formatInTimezone(
  utcDate: Date | string,
  timezone: string,
  formatStr: string
): string {
  const local = convertUtcToLocal(utcDate, timezone);
  return format(local, formatStr, { timeZone: timezone });
}

/**
 * Get the current wall-clock time in a given IANA timezone.
 */
export function getCurrentLocalTime(timezone: string): Date {
  return toZonedTime(new Date(), timezone);
}

/**
 * Get the current local time as "HH:MM" in a given IANA timezone.
 */
export function getCurrentLocalTimeString(timezone: string): string {
  return format(toZonedTime(new Date(), timezone), 'HH:mm', { timeZone: timezone });
}

/**
 * Get the current local date as "YYYY-MM-DD" in a given IANA timezone.
 */
export function getDateInTimezone(timezone: string): string {
  return format(toZonedTime(new Date(), timezone), 'yyyy-MM-dd', { timeZone: timezone });
}

/**
 * Returns true if the current local time in `timezone` matches `target`
 * within a `windowMinutes`-minute window (default ±5 min).
 *
 * Example: isTimeMatching('09:00', 'Asia/Kolkata', 5) returns true if
 * it is currently between 08:55 and 09:05 in Kolkata.
 */
export function isTimeMatching(
  target: string,
  timezone: string,
  windowMinutes = 5
): boolean {
  const [targetHour, targetMin] = target.split(':').map(Number);
  if (isNaN(targetHour) || isNaN(targetMin)) return false;

  const now = toZonedTime(new Date(), timezone);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = targetHour * 60 + targetMin;

  return Math.abs(nowMinutes - targetMinutes) <= windowMinutes;
}

/**
 * Add `minutes` to a UTC date and return the result.
 */
export function addMinutesToDate(date: Date, minutes: number): Date {
  return addMinutes(date, minutes);
}
