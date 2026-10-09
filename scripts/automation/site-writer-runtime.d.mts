import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { ActiveDeployment } from "./deployment-state.mjs";
import type {
  RetentionState,
  retainGithubSiteBundle,
} from "./site-bundle-github.mjs";
import type { RestoreWriterInput } from "./restore-writer.mjs";
export interface SiteWriterState extends RetentionState {
  activeDeployment: ActiveDeployment | null;
}
export function loadSiteWriterState(input: {
  root: string;
  env: Record<string, string | undefined>;
}): Promise<SiteWriterState>;
interface SiteWriterInput {
  runId: number;
  root?: string;
  env?: Record<string, string | undefined>;
  gh?: GhRunner;
  load?: () => Promise<SiteWriterState>;
  download?: (args: string[]) => Promise<Uint8Array>;
  isAncestor?: (ancestor: string, descendant: string) => boolean | null;
}
export interface SiteRecoveryInput {
  download?: (args: string[]) => Promise<Uint8Array>;
  gh: GhRunner;
  env: Record<string, string | undefined>;
  state: Pick<SiteWriterState, "revision" | "nowMs" | "activeDeployment">;
  isAncestor: (ancestor: string, descendant: string) => boolean | null;
}
export function protectedRestoreBundleIds(
  input: SiteRecoveryInput,
): Promise<number[]>;
export function recoverSiteBundleRetention(
  input: SiteRecoveryInput & { availableSlots?: number },
): Promise<Record<string, unknown>>;
export function recoverSiteWriterHandoffs(
  input: SiteRecoveryInput & { availableSlots?: number },
): Promise<Record<string, unknown>>;
export function runSiteWriterRetention(
  input: SiteWriterInput & { retain?: typeof retainGithubSiteBundle },
): ReturnType<typeof retainGithubSiteBundle>;
export function runSiteWriterRestoreConfirmation(
  input: SiteWriterInput & {
    bundleDownload?: (args: string[]) => Promise<Uint8Array>;
    probe?: RestoreWriterInput["probe"];
    readCurrent?: RestoreWriterInput["readCurrent"];
    commit?: RestoreWriterInput["commit"];
  },
): Promise<Record<string, unknown>>;
