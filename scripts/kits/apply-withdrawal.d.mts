import type { CanonicalKit } from "./apply-submission.mjs";

export function applyKitWithdrawal(input: {
  kit: CanonicalKit;
  actorId: number;
  now: string;
}): CanonicalKit;

export interface WithdrawalIssue {
  number: number;
  state: string;
  body?: string | null;
  labels?: Array<string | { name?: string }>;
  pull_request?: unknown;
  user: { id: number; login: string };
}

export function fetchWithdrawalIssue(input: {
  repository: string;
  issueNumber: number;
  request: (path: string) => Promise<unknown>;
}): Promise<WithdrawalIssue>;
