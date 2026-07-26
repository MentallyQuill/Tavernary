export type SubmissionClosurePlan =
  | { action: "ignore" }
  | {
      action: "merged" | "decline";
      issueNumber: number;
      addLabels: string[];
      removeLabels: string[];
      closeReason: "not_planned" | null;
      deleteBranch: string;
    };

export function planProjectSubmissionClosure(input: {
  merged: boolean;
  headRef: string;
  headRepository: string;
  baseRepository: string;
  body: string | null;
}): SubmissionClosurePlan;
