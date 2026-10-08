import type { DeploymentInventoryEvidence } from "./deployment-operations.mjs";
import type { ActiveDeployment } from "./deployment-state.mjs";
export function automationDataDigests(input: {
  catalog: {
    schemaVersion: number;
    projects: unknown[];
    kits: unknown[];
    tagVocabulary: unknown[];
    generatedAt?: string;
  };
  targets: {
    schema_version: number;
    repositories: unknown[];
    generated_at?: string;
  };
}): { catalogDigest: string; targetDigest: string };
export function verifiedAutomationDeployments(input: {
  activeDeployment?: ActiveDeployment | null;
  nowMs?: number;
  deployments: Array<
    Omit<DeploymentInventoryEvidence, "confirmation"> & {
      confirmation?: Omit<
        NonNullable<DeploymentInventoryEvidence["confirmation"]>,
        "buildDigest"
      > & { buildDigest?: string };
    }
  >;
  revision: string;
  catalogDigest: string;
  targetDigest: string;
  isAncestor: (ancestor: string, descendant: string) => boolean;
}): string[];
