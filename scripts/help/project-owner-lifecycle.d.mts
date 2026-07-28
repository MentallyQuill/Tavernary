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
  body: string | null;
}): ProjectOwnerClosurePlan;
