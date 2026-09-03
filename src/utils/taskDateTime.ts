import { format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * ONE SOURCE OF TRUTH for task date/time handling.
 *
 * Rules:
 * - `tasks.start_time` / `tasks.end_time` are absolute UTC timestamps (timestamptz).
 * - `tasks.timezone` is the IANA zone the user entered the time in — it is the
 *   authoritative zone for displaying that task, NOT the profile timezone.
 * - Date-only columns (`task_date`, `local_date`, `original_date`) are plain
 *   calendar dates and must never be timezone converted.
 * - Convert exactly once, at the display / persistence boundary.
 */

// Zones that are aliases of each other must behave identically.
const TIMEZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Europe/Kiev": "Europe/Kyiv",
  "UTC": "UTC",
  "Etc/UTC": "UTC",
  "GMT": "UTC",
};

export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Normalize a timezone string: resolve aliases, drop empty/invalid values. */
export function normalizeTimezone(tz?: string | null): string | null {
  if (!tz) return null;
  const trimmed = tz.trim();
  if (!trimmed) return null;
  const canonical = TIMEZONE_ALIASES[trimmed] ?? trimmed;
  return isValidTimezone(canonical) ? canonical : null;
}

/**
 * Resolve the timezone a task must be displayed in.
 * Priority: the task's own stored timezone → profile timezone → device timezone.
 */
export function resolveTaskTimezone(
  taskTimezone?: string | null,
  fallbackTimezone?: string | null
): string {
  return (
    normalizeTimezone(taskTimezone) ??
    normalizeTimezone(fallbackTimezone) ??
    normalizeTimezone(getDeviceTimezone()) ??
    "UTC"
  );
}

/** Format an absolute (UTC) timestamp in the given zone. */
export function formatTaskDateTime(
  utcIso: string | Date,
  timezone: string,
  pattern = "h:mm a"
): string {
  const date = utcIso instanceof Date ? utcIso : new Date(utcIso);
  if (Number.isNaN(date.getTime())) return "—";
  return format(toZonedTime(date, resolveTaskTimezone(timezone)), pattern);
}

/** Time-only display (e.g. "4:25 PM"). */
export function formatTaskTime(utcIso: string | Date, timezone: string): string {
  return formatTaskDateTime(utcIso, timezone, "h:mm a");
}

/** Parse a date-only value ("YYYY-MM-DD") without any timezone shift. */
export function parseDateOnly(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Format a date-only value; never shifts across day boundaries. */
export function formatDateOnly(dateOnly: string, pattern = "EEEE, MMM d"): string {
  const date = parseDateOnly(dateOnly);
  if (Number.isNaN(date.getTime())) return dateOnly;
  return format(date, pattern);
}

/** Today's calendar date (YYYY-MM-DD) in the given zone. */
export function getTodayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTaskTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Convert a `datetime-local` input value ("YYYY-MM-DDTHH:mm") entered in the
 * given zone into the absolute UTC instant to store.
 */
export function localInputToUtcISO(value: string, timezone: string): string {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = (timePart || "00:00").split(":").map(Number);
  const naive = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return fromZonedTime(naive, resolveTaskTimezone(timezone)).toISOString();
}

/** Render an absolute timestamp as a `datetime-local` input value in a zone. */
export function utcToLocalInput(utcIso: string, timezone: string): string {
  return formatTaskDateTime(utcIso, timezone, "yyyy-MM-dd'T'HH:mm");
}
