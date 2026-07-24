const DAY_MS = 24 * 60 * 60 * 1000;

export function isWithinDays(
  timestamp: string | null,
  now: string,
  days: number,
) {
  if (timestamp === null) {
    return false;
  }
  const age = new Date(now).getTime() - new Date(timestamp).getTime();
  return Number.isFinite(age) && age >= 0 && age <= days * DAY_MS;
}

export function releaseTimestamp(project: {
  latestReleaseAt: string | null;
  preset: { publishedAt: string | null } | null;
}) {
  return project.latestReleaseAt ?? project.preset?.publishedAt ?? null;
}
