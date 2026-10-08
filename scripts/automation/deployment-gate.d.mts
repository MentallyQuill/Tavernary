import type { RevisionManifest } from "./revision-manifest.mjs";
import type { ActiveDeployment } from "./deployment-state.mjs";
import type { DeploymentDecision } from "./deployment-plan.mjs";
export function readLatestPublishableRevision(input: {
  root: string;
  revision: string;
}): string;
export function readAuthoritativeDeployedSha(input: {
  root: string;
  revision: string;
}): string | null;
export function readAuthoritativeActiveDeployment(input: {
  root: string;
  revision: string;
}): ActiveDeployment | null;
export function gateDeployment(input: {
  root: string;
  manifest: RevisionManifest;
  requestedSha: string;
  currentMainSha: string;
  deployedSha: string | null;
  expectedBuildId?: string;
}): Promise<DeploymentDecision>;
export function runDeploymentGate(input: {
  root?: string;
  env?: NodeJS.ProcessEnv;
  manifestPath: string;
  requestedSha: string;
}): Promise<DeploymentDecision>;
