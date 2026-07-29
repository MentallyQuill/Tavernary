export interface OwnerPrMarker {
  schema_version: 1;
  issue_number: number;
  project_id: string;
  operation: "edit-card" | "move-source" | "delist";
  repository_id: number | null;
  authority_type: "repository-owner" | "tavernary-staff";
  actor_login: string;
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
    project_id?: string;
    project_ids: string[];
    source_id: string;
    publication_mode: "automatic" | "manual";
    operation: ProjectPublicationTransaction["operation"];
    repository_id: number | null;
    authority_type: OwnerPrMarker["authority_type"];
    actor_login: string;
    submitted_summary?: string;
    published_summary?: string;
    copy_result?: {
      result:
        | "accepted-unchanged"
        | "accepted-with-light-edits"
        | "accepted-with-policy-rewrite";
      change_reasons: string[];
      policy_signal: "none" | "catalog-policy-rewrite";
    };
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    warnings: string[];
    generated_paths: string[];
  };
  marker: ProjectPublicationTransaction;
}): string;
export function parseOwnerRequestPullRequestMarker(
  body: string,
): OwnerPrMarker | ProjectPublicationTransaction | null;
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
  repositoryId: number | null;
  authorityType: OwnerPrMarker["authority_type"];
  actorLogin: string;
  repository: string;
  remoteHeadSha: string | null;
  markerHeadSha?: string | null;
  existingMarker:
    | {
        kind: "project-owner";
        marker: OwnerPrMarker | ProjectPublicationTransaction;
      }
    | { kind: "project-submission"; marker: Record<string, unknown> }
    | null;
  generatedContentChanged: boolean;
  forceRegeneration?: boolean;
  generatedPaths: string[];
  pulls?: any[];
}): OwnerPrUpdatePlan;
import type { ProjectPublicationTransaction } from "../publication/project-publication-transaction.mjs";
