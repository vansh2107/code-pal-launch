/**
 * Calculate task duration using UTC timestamps.
 * Ensures accurate results no matter the user's timezone.
 */
export function calculateTaskDuration(
  startTimeISO: string,
  endTimeISO: string
): number {
  const start = new Date(startTimeISO);
  const end = new Date(endTimeISO);

  let minutes = Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
  if (minutes < 0) minutes = 0;

  return minutes;
}

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
