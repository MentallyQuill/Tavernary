export const OPEN_ISSUE_LIMIT: 10;
export const ISSUE_ADMISSION_LABEL: "issue-admitted";
export const ISSUE_LIMIT_LABEL: "issue-limit-reached";
export const ISSUE_LIMIT_MARKER: "<!-- tavernary-open-issue-limit -->";

export interface AdmissionIssue {
  number: number;
  created_at: string;
  user: { id: number };
  pull_request?: unknown;
}

export interface AdmissionDecision {
  admitted: boolean;
  reason: "trusted" | "within-limit" | "over-limit";
  openIssueCount: number;
  admittedIssueNumbers: number[];
}

export function decideIssueAdmission(input: {
  currentIssue: AdmissionIssue;
  openItems: AdmissionIssue[];
  authorAssociation: string;
}): AdmissionDecision;

export function buildIssueLimitComment(): string;
