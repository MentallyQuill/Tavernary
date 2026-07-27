import type { GeneratedSubmissionReport } from "./generate-project-submission.mjs";

export interface GeneratedPrMarker {
  schema_version: 1;
  issue_number: number;
  generated_head_sha: string;
  generated_paths: string[];
}

export interface GeneratedPathCollision {
  issueNumber: number;
  prNumber: number;
  prUrl: string;
  paths: string[];
}

export type SubmissionPrPlan =
  | { action: "create"; replacePaths: string[] }
  | { action: "update"; replacePaths: string[]; forced: boolean }
  | { action: "conflict"; message: string }
  | { action: "noop" };

export function submissionBranch(issueNumber: number): string;

export function renderSubmissionPullRequest(input: {
  issueNumber: number;
  projectName: string;
  report: GeneratedSubmissionReport;
  marker: GeneratedPrMarker;
}): string;

export function parseSubmissionPullRequestMarker(
  body: string,
): GeneratedPrMarker | null;

export function findSubmissionPathCollision(input: {
  repository: string;
  issueNumber: number;
  generatedPaths: string[];
  pulls: Array<{
    number: number;
    html_url: string;
    body?: string | null;
    head?: { ref?: string; repo?: { full_name?: string | null } | null };
  }>;
}): GeneratedPathCollision | null;

export function planSubmissionPrUpdate(input: {
  remoteHeadSha: string | null;
  markerHeadSha: string | null;
  forceRegeneration: boolean;
  generatedContentChanged: boolean;
  generatedPaths: string[];
}): SubmissionPrPlan;
