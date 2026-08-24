export type SubmissionClosurePlan =
  | { action: "ignore" }
  | {
      action: "merged" | "decline";
      issueNumber: number;
      addLabels: string[];
      removeLabels: string[];
      closeReason: "not_planned" | null;
      deleteBranch: string;
      retryForkDependents: true;
    };

export function planProjectSubmissionClosure(input: {
  merged: boolean;
  headRef: string;
  headRepository: string;
  baseRepository: string;
  body: string | null;
}): SubmissionClosurePlan;

export function terminalProjectValidationComment(input: {
  existingBody: string | null | undefined;
  action: "merged" | "decline";
  headSha: string;
}): string | null;
