import type {
  IdentitySourceRecord,
  IdentitySnapshot,
} from "../catalog/repository-identity-backfill.mjs";
import type { commitCanonicalData } from "./canonical-data.mjs";
import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export interface IdentityWriterState {
  revision: string;
  sources: IdentitySourceRecord[];
  snapshots: IdentitySnapshot[];
}
export function runPublisherWriterVerification(input: {
  runId: number;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
}): Promise<{ status: "verified"; lane: "main" | "branch"; sha: string }>;
export function runRepositoryIdentityWriter(input?: {
  sourceIds?: string;
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
  load?: () => Promise<IdentityWriterState>;
  validate?: (input: {
    sources: IdentitySourceRecord[];
    snapshots: IdentitySnapshot[];
  }) => Promise<{ errors: string[] }>;
  commit?: (
    input: Omit<Parameters<typeof commitCanonicalData>[0], "gh">,
  ) => Promise<{ sha: string }>;
}): Promise<
  | { status: "unchanged" | "superseded"; changed: 0 }
  | { status: "published"; changed: number; sha: string }
>;
