export interface ForkDependency {
  repositoryId: number;
  name: string;
  repository: string;
  canonicalUrl: string;
  issueNumber: number | null;
}

export interface SubmissionRepositoryParent {
  repositoryId: number;
  name: string;
  repository: string;
  canonicalUrl: string;
}

export interface SubmissionRepositoryObservation {
  visibility: "public" | "private";
  archived: boolean;
  fork: boolean;
  parent: SubmissionRepositoryParent | null;
}

export interface ForkDependencyProject {
  id: string;
  listing_status: string;
  repositoryId?: number | null;
  source_id: string;
}

export interface ForkDependencySource {
  id: string;
  type: string;
  repository_id?: number | null;
}

export interface SubmissionLookup {
  issueNumber: number;
  state: "open" | "merged" | "declined";
}

export type ForkUpstreamMarker = {
  schema_version: 1;
  repository_id: number;
  ancestry_repository_ids: number[];
} & ({ dependent_issue_number: number } | { dependent_project_ids: string[] });

export interface EnsureForkParentSubmissionResult {
  issueNumber: number;
  state: "created" | "open" | "merged" | "declined";
  dispatchTriage: boolean;
}

export type ForkDependencyGithubRequest = (
  path: string,
  options?: { method?: string; body?: string },
) => Promise<any>;

export type ForkDependencyDecision =
  | { status: "none" }
  | { status: "published"; parentProjectId: string }
  | {
      status: "not-listed";
      dependency: ForkDependency;
      attention?: "cycle" | "depth-limit";
    }
  | { status: "waiting"; dependency: ForkDependency };

export function classifyForkDependency(input: {
  repository: SubmissionRepositoryObservation | undefined;
  projects: ForkDependencyProject[];
  sources: ForkDependencySource[];
  priorSubmission: SubmissionLookup | null;
  ancestryRepositoryIds: number[];
}): ForkDependencyDecision;

export function parseForkUpstreamMarker(
  body: string,
): ForkUpstreamMarker | null;

export function renderForkParentIssue(input: {
  dependency: ForkDependency;
  dependentIssueNumber?: number;
  dependentProjectIds?: string[];
  manifest: import("../../src/features/submissions/project-submission-manifest.mjs").ProjectSubmissionManifest;
  ancestryRepositoryIds: number[];
}): { title: string; body: string; labels: string[] };

export function ensureForkParentSubmission(input: {
  repository: string;
  dependency: ForkDependency;
  dependentIssueNumber?: number;
  dependentProjectIds?: string[];
  manifest: import("../../src/features/submissions/project-submission-manifest.mjs").ProjectSubmissionManifest;
  ancestryRepositoryIds: number[];
  request: ForkDependencyGithubRequest;
}): Promise<EnsureForkParentSubmissionResult>;
