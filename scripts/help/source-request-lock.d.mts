export type SourceRequestAdmissionPlan =
  | { action: "admit" }
  | {
      action: "reject";
      reasonCode: "source-request-already-open";
      conflictingIssueNumber: number;
    };

export function planSourceRequestAdmission(input: {
  sourceId: string;
  issueNumber: number;
  issues?: unknown[];
  pulls?: unknown[];
}): SourceRequestAdmissionPlan;
