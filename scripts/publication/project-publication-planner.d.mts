import type { ProjectPublicationTransaction } from "./project-publication-transaction.mjs";

export type ProjectPublicationPlan =
  | { action: "ignore" }
  | { action: "paused"; reasonCode: string }
  | {
      action: "retry" | "reject";
      reasonCode: string;
      producer?: ProjectPublicationTransaction["producer"];
      issueNumber?: number;
    }
  | {
      action: "regenerate";
      reasonCode: string;
      producer: ProjectPublicationTransaction["producer"];
      issueNumber: number;
    }
  | {
      action: "await-maintainer";
      reasonCode: "manual-approval-required";
      producer: ProjectPublicationTransaction["producer"];
      issueNumber: number;
      projectIds: string[];
      sourceId: string;
    }
  | {
      action: "merge";
      pullNumber: number;
      expectedHeadSha: string;
      producer: ProjectPublicationTransaction["producer"];
      issueNumber: number;
      projectIds: string[];
      sourceId: string;
    };

export function planProjectPublication(
  input: Record<string, any>,
): ProjectPublicationPlan;
