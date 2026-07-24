const DAY_MS = 24 * 60 * 60 * 1000;

export function daysSince(timestamp: string | null, now: string) {
  if (!timestamp) return null;
  return Math.max(
    0,
    Math.floor(
      (new Date(now).getTime() - new Date(timestamp).getTime()) / DAY_MS,
    ),
  );
}

export function commitFreshnessPercent(timestamp: string | null, now: string) {
  const days = daysSince(timestamp, now);
  if (days === null) return 0;
  return Math.max(0, Math.min(100, 100 - (days / 30) * 100));
}
