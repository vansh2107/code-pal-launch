import { toZonedTime, fromZonedTime } from 'npm:date-fns-tz@3.2.0';
import { format, addHours } from 'npm:date-fns@3.6.0';

export function convertUtcToLocal(utcDate: Date | string, timezone: string): Date {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  return toZonedTime(date, timezone);
}

export function convertLocalToUtc(localDate: Date, timezone: string): Date {
  return fromZonedTime(localDate, timezone);
}

export function formatInTimezone(date: Date | string, timezone: string, formatStr: string): string {
  const localDate = convertUtcToLocal(date, timezone);
  return format(localDate, formatStr);
}

export function getCurrentLocalTime(timezone: string): Date {
  return convertUtcToLocal(new Date(), timezone);
}

export function getCurrentLocalTimeString(timezone: string, formatStr = 'HH:mm'): string {
  return formatInTimezone(new Date(), timezone, formatStr);
}

export function getNextReminderTime(lastReminderUtc: string | null, startTimeUtc: string, timezone: string): Date {
  if (!lastReminderUtc) {
    // First reminder: at start time
    return convertUtcToLocal(startTimeUtc, timezone);
  }
  
  // Subsequent reminders: 2 hours after last reminder
  const lastReminderLocal = convertUtcToLocal(lastReminderUtc, timezone);
  return addHours(lastReminderLocal, 2);
}

export function isTimeMatching(currentTime: Date, targetTime: string, windowMinutes = 2): boolean {
  const [targetHour, targetMinute] = targetTime.split(':').map(Number);
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  
  return currentHour === targetHour && 
         currentMinute >= targetMinute && 
         currentMinute < targetMinute + windowMinutes;
}
