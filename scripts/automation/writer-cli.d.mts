import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { GithubBackoff, GithubWriterRunner } from "./github-backoff.mjs";
import type { synchronizeWriterCheckout } from "./writer-runtime.mjs";
export type AutomationWriterMode =
  | "enrichment-request"
  | "reconcile"
  | "reconcile-project"
  | "publish"
  | "prepare"
  | "confirm"
  | "confirm-restore"
  | "retain"
  | "backfill-identities"
  | "verify-publisher"
  | "finalize"
  | "advisory-notice";
export function runAutomationWriterCli(options?: {
  env?: Record<string, string | undefined>;
  root?: string;
  gh?: GhRunner;
  download?: (args: string[]) => Promise<Uint8Array>;
  nowMs?: number;
  requestLimit?: number;
  loadCooldown?: () => Promise<GithubBackoff | null>;
  persistCooldown?: (cooldown: GithubBackoff) => Promise<void>;
  run?: Parameters<typeof synchronizeWriterCheckout>[0]["run"];
  event?: { inputs?: Record<string, string> };
  handlers?: Partial<
    Record<
      AutomationWriterMode,
      (
        inputs: Record<string, string>,
        gh?: GithubWriterRunner,
      ) => Promise<unknown>
    >
  >;
  write?: (text: string) => void;
}): Promise<number>;
