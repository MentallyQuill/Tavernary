import type { GitHubRepositoryIdentity } from "./project-owner-authority.d.mts";

export type ProjectRegistryRecord = {
  id: string;
  kind: "frontend" | "extension" | "preset";
  metadata_status: "provisional" | "curated";
  source: {
    type: "github";
    repository: string;
    repository_id: number;
  };
  [key: string]: unknown;
};

export type RepositorySnapshot = {
  provider: "github";
  project_id: string;
  repository: {
    id: number;
    owner: string;
    name: string;
    url: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export interface OwnerMutationResult {
  record: ProjectRegistryRecord;
  snapshot: RepositorySnapshot | null;
  changedPaths: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface OwnerMutationInput {
  issueNumber: number;
  manifest: unknown;
  record: Record<string, unknown>;
  snapshot?: Record<string, unknown> | null;
  repository?: GitHubRepositoryIdentity;
  vocabularies: {
    frontends: readonly (string | { id: string })[];
    primaryFunctions: readonly (string | { id: string })[];
    capabilities: readonly (string | { id: string })[];
    modelFamilies: readonly (string | { id: string })[];
    completionFormats: readonly (string | { id: string })[];
  };
}

export function applyProjectOwnerRequest(
  input: OwnerMutationInput,
): OwnerMutationResult;
