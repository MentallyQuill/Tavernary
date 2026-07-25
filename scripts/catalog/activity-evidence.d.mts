export type EvidencePrecision = "exact" | "interval";
export type EvidenceStatus = "provisional" | "complete" | "degraded";

export interface SourceWeek {
  week_start: string;
  latest_at: string;
  precision: EvidencePrecision;
}

export interface ActivityEvidence {
  evidence_head_sha?: string | null;
  latest_source_activity_at: string | null;
  source_weeks: SourceWeek[];
  provisional_weeks: boolean[] | null;
  latest_release_at: string | null;
  evidence_status: EvidenceStatus;
  baseline_completed_at: string | null;
  baseline_attempts: number;
}

export function weekStartUtc(timestamp: string): string;
export function weekWindow(now: string): string[];
export function normalizeSourceWeeks(
  weeks: SourceWeek[],
  now: string,
): SourceWeek[];
export function recordIntervalActivity(
  activity: ActivityEvidence,
  input: { activityAt: string; observedAt: string },
): ActivityEvidence;
export function completeBaseline(
  activity: ActivityEvidence,
  input: {
    now: string;
    completedAt: string;
    sourceCommits: string[];
  },
): ActivityEvidence;
export function derivePublicActivity(
  activity: ActivityEvidence,
  now: string,
): {
  activeWeeks12: number;
  weeklyActivity: boolean[];
  dormant: boolean;
};
