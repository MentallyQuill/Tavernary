import type { AdmissionDecision, AdmissionIssue } from "./issue-admission.mjs";

export interface AdmissionEvent {
  action: "opened" | "reopened";
  repository: { full_name: string };
  issue: AdmissionIssue & {
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

export function listOpenIssues(input: {
  repository: string;
  creator: string;
  request: GitHubRequest;
}): Promise<AdmissionIssue[]>;

export function processIssueAdmission(input: {
  event: AdmissionEvent;
  request: GitHubRequest;
}): Promise<
  | AdmissionDecision
  | {
      admitted: true;
      reason: "lookup-failed";
      openIssueCount: 0;
      admittedIssueNumbers: [];
    }
>;

export function issueAdmissionOutputs(
  decision: { admitted: boolean },
  event: AdmissionEvent,
): {
  admitted: string;
  issue_number: string;
};
