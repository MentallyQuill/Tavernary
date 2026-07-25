const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const WINDOW_WEEKS = 12;

function isoTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid activity timestamp: ${timestamp}`);
  }
  return date.toISOString();
}

function laterTimestamp(left, right) {
  if (left === null) return right;
  if (right === null) return left;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

export function weekStartUtc(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid activity timestamp: ${timestamp}`);
  }
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function weekWindow(now) {
  const newestStart = new Date(`${weekStartUtc(now)}T00:00:00.000Z`);
  return Array.from({ length: WINDOW_WEEKS }, (_, index) => {
    const date = new Date(
      newestStart.getTime() - (WINDOW_WEEKS - index - 1) * WEEK_MS,
    );
    return date.toISOString().slice(0, 10);
  });
}

export function normalizeSourceWeeks(weeks, now) {
  const allowed = new Set(weekWindow(now));
  const byWeek = new Map();

  for (const week of weeks) {
    const latestAt = isoTimestamp(week.latest_at);
    const weekStart = weekStartUtc(`${week.week_start}T00:00:00.000Z`);
    if (!allowed.has(weekStart)) continue;

    const current = byWeek.get(weekStart);
    byWeek.set(weekStart, {
      week_start: weekStart,
      latest_at: laterTimestamp(current?.latest_at ?? null, latestAt),
      precision:
        current?.precision === "exact" || week.precision === "exact"
          ? "exact"
          : "interval",
    });
  }

  return [...byWeek.values()].sort((left, right) =>
    right.week_start.localeCompare(left.week_start),
  );
}

export function recordIntervalActivity(activity, input) {
  const activityAt = isoTimestamp(input.activityAt);
  isoTimestamp(input.observedAt);
  const weekStart = weekStartUtc(activityAt);
  const sourceWeeks = normalizeSourceWeeks(
    [
      ...activity.source_weeks,
      {
        week_start: weekStart,
        latest_at: activityAt,
        precision: "interval",
      },
    ],
    input.observedAt,
  );

  return {
    ...activity,
    latest_source_activity_at: laterTimestamp(
      activity.latest_source_activity_at,
      activityAt,
    ),
    source_weeks: sourceWeeks,
  };
}

export function completeBaseline(activity, input) {
  const completedAt = isoTimestamp(input.completedAt);
  isoTimestamp(input.now);
  const timestamps = input.sourceCommits.map(isoTimestamp);
  const sourceWeeks = normalizeSourceWeeks(
    timestamps.map((timestamp) => ({
      week_start: weekStartUtc(timestamp),
      latest_at: timestamp,
      precision: "exact",
    })),
    input.now,
  );
  const latestSourceActivityAt = timestamps.reduce(
    (latest, timestamp) => laterTimestamp(latest, timestamp),
    null,
  );

  return {
    ...activity,
    latest_source_activity_at: laterTimestamp(
      activity.latest_source_activity_at,
      latestSourceActivityAt,
    ),
    source_weeks: sourceWeeks,
    provisional_weeks: null,
    evidence_status: "complete",
    baseline_completed_at: completedAt,
  };
}

export function derivePublicActivity(activity, now) {
  const starts = weekWindow(now);
  const active = new Set(
    normalizeSourceWeeks(activity.source_weeks, now).map(
      ({ week_start }) => week_start,
    ),
  );
  const weeklyActivity = starts.map((start) => active.has(start));
  const activeWeeks12 = weeklyActivity.filter(Boolean).length;
  const latest = activity.latest_source_activity_at;
  const latestAge =
    latest === null
      ? Number.POSITIVE_INFINITY
      : new Date(now).getTime() - new Date(latest).getTime();

  return {
    activeWeeks12,
    weeklyActivity,
    dormant:
      activity.evidence_status === "complete" && latestAge > 12 * WEEK_MS,
  };
}
