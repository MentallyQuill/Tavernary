export type ProjectOwnerClosurePlan =
  | { action: "ignore" }
  | {
      action: "merged" | "decline";
      issueNumber: number;
      addLabels: string[];
      removeLabels: string[];
      closeReason: "not_planned" | null;
      deleteBranch: string;
    };

export function planProjectOwnerClosure(input: {
  merged: boolean;
  headRef: string;
  headRepository: string;
  baseRepository: string;
  baseRef: string;
  defaultBranch: string;
  headSha: string;
  body: string | null;
}): ProjectOwnerClosurePlan;

export function terminalProjectValidationComment(input: {
  existingBody: string | null | undefined;
  action: "merged" | "decline";
  headSha: string;
}): string | null;
