import type { AdmissionIssue } from "./issue-admission.mjs";

export interface AdmissionEvent {
  action: "opened" | "reopened" | "edited";
  repository: { full_name: string };
  issue: AdmissionIssue & {
    title?: string;
    body?: string;
    state: string;
    author_association: string;
    user: { id: number; login: string };
    labels: Array<string | { name: string }>;
  };
}

export type GitHubRequest = (
  path: string,
  options?: { method?: string; body?: string },
) => Promise<unknown>;

export type IssueRoute =
  "project" | "kit" | "kit-withdrawal" | "none" | "conflict";

export interface AdmissionResult {
  admitted: boolean;
  reason: string;
  openIssueCount: number;
  admittedIssueNumbers: number[];
  route: IssueRoute;
}

export function issueRouteFromLabels(
  labels?: Array<string | { name: string }>,
): IssueRoute;

export function effectiveIssueRoute(issue?: {
  title?: string;
  body?: string;
  labels?: Array<string | { name: string }>;
}): IssueRoute;

export function listOpenIssues(input: {
  repository: string;
  creator: string;
  request: GitHubRequest;
}): Promise<AdmissionIssue[]>;

export function processIssueAdmission(input: {
  event: AdmissionEvent;
  request: GitHubRequest;
}): Promise<AdmissionResult>;

export function issueAdmissionOutputs(
  decision: { admitted: boolean; route?: IssueRoute },
  event: AdmissionEvent,
): {
  admitted: string;
  issue_number: string;
  route: IssueRoute;
};
