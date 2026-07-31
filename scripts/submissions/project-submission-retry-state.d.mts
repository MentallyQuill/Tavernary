export type RedditRetryOutcome = "pending" | "placeholder" | "source-ready";

export type RedditRetryState = {
  schema_version: 1;
  issue_number: number;
  source_identity: `reddit:${string}`;
  completed_waves: number;
  next_eligible_retry_at: string | null;
  last_reason_code: string;
  updated_at: string;
  outcome: RedditRetryOutcome;
};

export type RedditRetryExpectedIdentity = {
  issueNumber: number;
  sourceIdentity: `reddit:${string}`;
};

export const REDDIT_RETRY_MARKER: string;

export function normalizeRedditRetryState(
  value: unknown,
  expected: RedditRetryExpectedIdentity,
): RedditRetryState | null;

export function renderRedditRetryState(state: RedditRetryState): string;

export function parseRedditRetryState(
  body: unknown,
  expected: RedditRetryExpectedIdentity,
): RedditRetryState | null;

export function loadRedditRetryState(
  comments: Array<{ id?: number; body?: unknown }>,
  expected: RedditRetryExpectedIdentity,
): RedditRetryState | null;

export function planRedditRetryTransition(input: {
  current: RedditRetryState | null;
  issueNumber: number;
  sourceIdentity: `reddit:${string}`;
  reasonCode: string;
  now: string;
}): {
  action: "schedule" | "placeholder";
  state: RedditRetryState;
};

export function upsertRedditRetryComment(input: {
  repository: string;
  issueNumber: number;
  sourceIdentity: `reddit:${string}`;
  state: RedditRetryState;
  runUrl?: string;
  request: (path: string, options?: Record<string, unknown>) => Promise<any>;
}): Promise<{ action: "noop" } | { action: "update"; commentId: number }>;

export function reconcileRedditRetryReport(input: {
  report: Record<string, any>;
  repository: string;
  runUrl: string;
  now: string;
  request: (path: string, options?: Record<string, unknown>) => Promise<any>;
}): Promise<{ action: "noop" } | { action: "update"; commentId: number }>;
