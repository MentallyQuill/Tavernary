export interface DependencyPull {
  number: number;
  state: string;
  draft: boolean;
  user: { id: number; type: string };
  head: { sha: string; repo: { full_name: string } };
  base: { ref: string; repo: { full_name: string } };
}
export interface DependencyMetadata {
  ecosystem: "npm" | "github-actions";
  provenance: boolean;
  permissionsChanged: boolean;
  updates: Array<{ name: string; from: string; to: string }>;
}
export interface DependencyCheck {
  name: string;
  sha: string;
  conclusion: string | null;
  appId: number;
  workflow: string;
}
export interface DependencyInput {
  pull: DependencyPull;
  metadata: DependencyMetadata;
  files: string[];
  checks: DependencyCheck[];
  currentMainSha: string;
  mergeBaseSha: string;
  allowedPackages: string[];
  deploymentHealthy: boolean;
}
export type DependencyDecision =
  | { action: "merge"; headSha: string; baseSha: string; pullNumber: number }
  | { action: "owner-review" | "wait" | "refresh-base"; reason: string };
export function planDependencyUpdate(
  input: DependencyInput,
): DependencyDecision;
export function inspectNpmDependencyUpdate(input: {
  beforePackage: Record<string, unknown>;
  afterPackage: Record<string, unknown>;
  beforeLock: Record<string, unknown>;
  afterLock: Record<string, unknown>;
}): DependencyMetadata;
export const ALLOWED_NPM_DEPENDENCIES: string[];
export function runDependencyWriter(options?: {
  root?: string;
  availableSlots?: number;
  pullNumbers?: number[];
  env?: Record<string, string | undefined>;
  gh?: (args: string[], stdin?: string) => Promise<string>;
  loadDeployment?: (input: { revision: string }) => Promise<boolean>;
}): Promise<{
  status: string;
  pullNumber?: number;
  reason?: string;
  sha?: string;
  decisions: Array<{ pullNumber: number; action: string; reason?: string }>;
}>;
