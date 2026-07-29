import type { ProjectPublicationTransaction } from "./project-publication-transaction.mjs";

export function planCopyAdjustmentNotice(
  transaction: ProjectPublicationTransaction,
  existingComments?: any[],
):
  | { action: "none" | "noop" }
  | { action: "create"; body: string }
  | { action: "update"; commentId: number; body: string };

export function planOwnerDelistNotice(input: {
  transaction: ProjectPublicationTransaction;
  project: Record<string, any>;
  kits: Array<Record<string, any>>;
  pull: Record<string, any>;
  issue: Record<string, any>;
  publishedAt?: string;
  existingIssues: Array<Record<string, any>>;
}):
  | { action: "none" }
  | { action: "noop"; issueNumber: number }
  | {
      action: "create" | "update";
      issueNumber?: number;
      title: string;
      body: string;
      labels: string[];
    };
