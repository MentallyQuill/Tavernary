import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { synchronizeWriterCheckout } from "./writer-runtime.mjs";
export type GithubWriterRunner = GhRunner & {
  download: (args: string[]) => Promise<Uint8Array>;
};
export interface GithubBackoff {
  schemaVersion: 1;
  nextEligibleAt: string;
  reason: "github-rate-limit";
}
export const githubBackoffPath: string;
export function validateGithubBackoff(value: unknown): GithubBackoff;
export function loadGithubBackoff(input: {
  root: string;
}): Promise<GithubBackoff | null>;
export function persistGithubBackoff(input: {
  root: string;
  env: Record<string, string | undefined>;
  cooldown: GithubBackoff;
  run?: Parameters<typeof synchronizeWriterCheckout>[0]["run"];
}): Promise<void>;
export function runGithubWriterPass<T>(input: {
  loadCooldown: () => Promise<GithubBackoff | null>;
  persistCooldown: (cooldown: GithubBackoff) => Promise<void>;
  gh: GhRunner;
  download?: (args: string[]) => Promise<Uint8Array>;
  nowMs: number;
  now?: () => number;
  requestLimit?: number;
  run: (gh: GithubWriterRunner) => Promise<T>;
}): Promise<T | { status: "waiting"; reason: string; nextEligibleAt: string }>;
