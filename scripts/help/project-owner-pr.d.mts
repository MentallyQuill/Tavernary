export interface OwnerPrMarker {
  schema_version: 1;
  issue_number: number;
  project_id: string;
  operation: "edit-card" | "move-source" | "delist";
  repository_id: number;
  verified_owner_login: string;
  generated_head_sha: string;
  generated_paths: string[];
}

export type OwnerPrUpdatePlan =
  | { action: "create" | "update"; replacePaths: string[] }
  | { action: "noop" }
  | {
      action: "conflict";
      reasonCode:
        | "existing-marker-mismatch"
        | "maintainer-divergence"
        | "generated-path-collision";
      message: string;
      collision?: {
        issueNumber: number;
        prNumber: number;
        prUrl: string;
        paths: string[];
      };
    };

export function ownerRequestBranch(issueNumber: number): string;
export function renderOwnerRequestPullRequest(input: {
  issueNumber: number;
  projectName: string;
  report: {
    issue_number: number;
    project_id: string;
    operation: OwnerPrMarker["operation"];
    repository_id: number;
    verified_owner_login: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    warnings: string[];
    generated_paths: string[];
  };
  marker: OwnerPrMarker;
}): string;
export function parseOwnerRequestPullRequestMarker(
  body: string,
): OwnerPrMarker | null;
export function findOwnerRequestPathCollision(input: {
  repository: string;
  issueNumber: number;
  generatedPaths: string[];
  pulls?: any[];
}): {
  issueNumber: number;
  prNumber: number;
  prUrl: string;
  paths: string[];
} | null;
export function planOwnerPrUpdate(input: {
  issueNumber: number;
  projectId: string;
  operation: OwnerPrMarker["operation"];
  repositoryId: number;
  verifiedOwnerLogin: string;
  repository: string;
  remoteHeadSha: string | null;
  markerHeadSha?: string | null;
  existingMarker:
    | { kind: "project-owner"; marker: OwnerPrMarker }
    | { kind: "project-submission"; marker: Record<string, unknown> }
    | null;
  generatedContentChanged: boolean;
  forceRegeneration?: boolean;
  generatedPaths: string[];
  pulls?: any[];
}): OwnerPrUpdatePlan;
