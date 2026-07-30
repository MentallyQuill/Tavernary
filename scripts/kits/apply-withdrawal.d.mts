import type { CanonicalKit } from "./apply-submission.mjs";
import type { KitWithdrawalManifest } from "../../src/features/kits/kit-withdrawal-manifest.mjs";

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
  user?: { id: unknown; login?: string };
}

export function fetchWithdrawalIssue(input: {
  repository: string;
  issueNumber: number;
  request: (path: string) => Promise<unknown>;
}): Promise<WithdrawalIssue>;

export type ParsedKitWithdrawalIssue =
  | { valid: true; manifest: KitWithdrawalManifest }
  | { valid: false; errors: string[]; kitId?: string | null };

export function parseKitWithdrawalIssue(
  body?: string,
): ParsedKitWithdrawalIssue;

export type KitWithdrawalResult =
  | { status: "applied"; kitId: string; changed: boolean }
  | {
      status: "needs-information";
      errors: string[];
      returnUrl: string;
    };

export function processKitWithdrawal(input: {
  issue: WithdrawalIssue;
  now: string;
  loadKit: (kitId: string) => Promise<CanonicalKit>;
  writeKit: (kitId: string, kit: CanonicalKit) => Promise<void>;
}): Promise<KitWithdrawalResult>;
