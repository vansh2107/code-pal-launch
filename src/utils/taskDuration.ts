/**
 * Calculate task duration in user's local timezone
 * Handles tasks that cross midnight
 */
export function calculateTaskDuration(
  startTimeISO: string,
  endTimeISO: string,
  timezone: string
): number {
  // Parse the ISO strings as Date objects
  const start = new Date(startTimeISO);
  const end = new Date(endTimeISO);
  
  // Calculate duration in minutes
  let durationMinutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
  
  // If negative, task crossed midnight - add 24 hours
  if (durationMinutes < 0) {
    durationMinutes += 24 * 60;
  }
  
  return durationMinutes;
}

/**
 * Format duration in a human-readable way
 */
export function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
