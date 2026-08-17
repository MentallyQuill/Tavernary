export type GeneratedProjectBranchCleanupPlan =
  | {
      action: "delete" | "absent";
      branch: string;
      expectedHeadSha: string;
    }
  | {
      action: "moved";
      branch: string;
      expectedHeadSha: string;
      currentHeadSha: string;
    };

export type GeneratedProjectBranchCleanupPull = {
  number: number;
  state: string;
  head?: {
    ref?: string;
    sha?: string;
    repo?: { full_name?: string | null } | null;
  } | null;
  base?: {
    ref?: string;
    repo?: { full_name?: string | null } | null;
  } | null;
};

export function planGeneratedProjectBranchCleanup(input: {
  repository: string;
  defaultBranch: string;
  pullNumber: number;
  expectedBranch: string;
  expectedHeadSha: string;
  currentHeadSha: string | null;
  pull: GeneratedProjectBranchCleanupPull;
}): GeneratedProjectBranchCleanupPlan;
