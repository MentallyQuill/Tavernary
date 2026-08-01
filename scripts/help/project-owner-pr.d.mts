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
    project_id?: string | null;
    project_ids: string[];
    source_id: string;
    publication_mode: "automatic" | "manual";
    operation: ProjectPublicationTransaction["operation"];
    repository_id: number | null;
    authority_type: OwnerPrMarker["authority_type"];
    actor_login: string;
    submitted_summary?: string | null;
    published_summary?: string;
    copy_mode?: "preserve" | "synthesize";
    copy_result?: {
      result:
        | "accepted-unchanged"
        | "accepted-with-light-edits"
        | "accepted-with-policy-rewrite";
      change_reasons: string[];
      policy_signal: "none" | "catalog-policy-rewrite";
    } | null;
    copy_results?: Array<{
      project_id: string;
      mode: "preserve" | "synthesize";
      review_status?: "validated" | "unavailable";
      reason_code?: "copy-review-unavailable";
      diagnostic?: import("../catalog/catalog-copy-diagnostic.mjs").CopyReviewDiagnostic;
      submitted_summary: string | null;
      published_summary: string;
      copy_result: {
        result:
          | "accepted-unchanged"
          | "accepted-with-light-edits"
          | "accepted-with-policy-rewrite";
        change_reasons: string[];
        policy_signal: "none" | "catalog-policy-rewrite";
      } | null;
    }>;
    before: unknown;
    after: unknown;
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

export function planOwnerPrUpdate(input: {
  report: {
    issue_number: number;
    project_ids: string[];
    source_id: string;
    operation: ProjectPublicationTransaction["operation"];
    publication_mode: "automatic" | "manual";
    source_identity: ProjectPublicationTransaction["source_identity"];
    actor_id: number;
    actor_login: string;
    actor_type: "User";
    authority_type: OwnerPrMarker["authority_type"];
    request_fingerprint: string;
    input_fingerprints: ProjectPublicationTransaction["input_fingerprints"];
    policy_version: string;
    copy_mode?: "preserve" | "synthesize";
    copy_result?: {
      result:
        | "accepted-unchanged"
        | "accepted-with-light-edits"
        | "accepted-with-policy-rewrite";
      change_reasons: string[];
      policy_signal: "none" | "catalog-policy-rewrite";
    } | null;
    generated_paths: string[];
  };
  repository: string;
  remoteHeadSha: string | null;
  existingMarker:
    | {
        kind: "project-owner";
        marker: OwnerPrMarker | ProjectPublicationTransaction;
      }
    | { kind: "project-submission"; marker: Record<string, unknown> }
    | null;
  generatedContentChanged: boolean;
  pulls?: any[];
}): OwnerPrUpdatePlan;
import type { ProjectPublicationTransaction } from "../publication/project-publication-transaction.mjs";
