import { expect, test } from "vitest";

import {
  completeBaseline,
  derivePublicActivity,
  normalizeSourceWeeks,
  recordIntervalActivity,
  weekStartUtc,
  weekWindow,
} from "../../scripts/catalog/activity-evidence.mjs";
import type { ActivityEvidence } from "../../scripts/catalog/activity-evidence.mjs";

function provisionalActivity(): ActivityEvidence {
  return {
    latest_source_activity_at: null,
    source_weeks: [],
    provisional_weeks: Array.from({ length: 12 }, () => false),
    latest_release_at: null,
    evidence_status: "provisional",
    baseline_completed_at: null,
    baseline_attempts: 0,
  };
}

test("normalizes Monday UTC across a Sunday boundary", () => {
  expect(weekStartUtc("2026-07-19T23:59:59.000Z")).toBe("2026-07-13");
  expect(weekStartUtc("2026-07-20T00:00:00.000Z")).toBe("2026-07-20");
});

test("builds twelve Monday weeks from oldest to newest", () => {
  expect(weekWindow("2026-07-24T00:00:00.000Z")).toEqual([
    "2026-05-04",
    "2026-05-11",
    "2026-05-18",
    "2026-05-25",
    "2026-06-01",
    "2026-06-08",
    "2026-06-15",
    "2026-06-22",
    "2026-06-29",
    "2026-07-06",
    "2026-07-13",
    "2026-07-20",
  ]);
});

test("one interval activates a week without commit-volume weighting", () => {
  const first = recordIntervalActivity(provisionalActivity(), {
    activityAt: "2026-07-22T18:31:00.000Z",
    observedAt: "2026-07-23T07:17:00.000Z",
  });
  const second = recordIntervalActivity(first, {
    activityAt: "2026-07-24T18:31:00.000Z",
    observedAt: "2026-07-25T07:17:00.000Z",
  });

  expect(second.source_weeks).toEqual([
    {
      week_start: "2026-07-20",
      latest_at: "2026-07-24T18:31:00.000Z",
      precision: "interval",
    },
  ]);
  expect(second.latest_source_activity_at).toBe("2026-07-24T18:31:00.000Z");
});

test("normalizes duplicate weeks and preserves exact precision", () => {
  expect(
    normalizeSourceWeeks(
      [
        {
          week_start: "2026-07-20",
          latest_at: "2026-07-22T00:00:00.000Z",
          precision: "exact",
        },
        {
          week_start: "2026-07-20",
          latest_at: "2026-07-24T00:00:00.000Z",
          precision: "interval",
        },
      ],
      "2026-07-24T00:00:00.000Z",
    ),
  ).toEqual([
    {
      week_start: "2026-07-20",
      latest_at: "2026-07-24T00:00:00.000Z",
      precision: "exact",
    },
  ]);
});

test("completes a baseline with exact weekly evidence", () => {
  const activity = completeBaseline(provisionalActivity(), {
    now: "2026-07-24T00:00:00.000Z",
    completedAt: "2026-07-24T00:00:00.000Z",
    sourceCommits: [
      "2026-07-22T00:00:00.000Z",
      "2026-07-08T00:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
    ],
  });

  expect(activity).toMatchObject({
    latest_source_activity_at: "2026-07-22T00:00:00.000Z",
    provisional_weeks: null,
    evidence_status: "complete",
    baseline_completed_at: "2026-07-24T00:00:00.000Z",
  });
  expect(derivePublicActivity(activity, "2026-07-24T00:00:00.000Z")).toEqual({
    activeWeeks12: 3,
    weeklyActivity: [
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      true,
      false,
      true,
    ],
    dormant: false,
  });
});

test("keeps the latest source timestamp after its week ages out", () => {
  const activity = completeBaseline(provisionalActivity(), {
    now: "2026-07-24T00:00:00.000Z",
    completedAt: "2026-07-24T00:00:00.000Z",
    sourceCommits: ["2026-04-01T00:00:00.000Z"],
  });

  expect(activity.source_weeks).toEqual([]);
  expect(activity.latest_source_activity_at).toBe("2026-04-01T00:00:00.000Z");
  expect(derivePublicActivity(activity, "2026-07-24T00:00:00.000Z")).toEqual({
    activeWeeks12: 0,
    weeklyActivity: Array.from({ length: 12 }, () => false),
    dormant: true,
  });
});

test("rejects invalid activity timestamps", () => {
  expect(() => weekStartUtc("not-a-date")).toThrow(
    "Invalid activity timestamp: not-a-date",
  );
});
