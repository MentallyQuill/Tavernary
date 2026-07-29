import type { ProjectOwnerManifest } from "../../src/features/help/project-owner-manifest.mjs";
import type { GitHubRepositoryIdentity } from "./project-owner-authority.mjs";

export interface OwnerMutationInput {
  issueNumber: number;
  manifest: unknown;
  projects: Array<Record<string, unknown>>;
  source: Record<string, unknown>;
  snapshot?: Record<string, unknown> | null;
  repository?: GitHubRepositoryIdentity;
  publishedSummary?: string;
  catalogedAt?: string;
  vocabularies: Record<string, unknown>;
}

export interface OwnerMutationResult {
  projects: Array<Record<string, unknown>>;
  source: Record<string, unknown>;
  snapshot: Record<string, unknown> | null;
  changedPaths: string[];
  before: unknown;
  after: unknown;
}

export function applyProjectOwnerRequest(
  input: OwnerMutationInput,
): OwnerMutationResult;

export function assertProjectOwnerRequestApplicable(
  input: OwnerMutationInput,
): {
  manifest: ProjectOwnerManifest;
  project: Record<string, unknown> | null;
};
