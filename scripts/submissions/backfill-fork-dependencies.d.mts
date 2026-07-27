import type { ProjectSubmissionManifest } from "../../src/features/submissions/project-submission-manifest.mjs";

export interface ForkBackfillCandidate {
  parentRepositoryId: number;
  parentName: string;
  parentRepository: string;
  dependentProjectIds: string[];
  dependentRepositoryIds: number[];
  manifest: ProjectSubmissionManifest;
}

export interface BackfillReport {
  mode: "dry-run" | "apply";
  candidates: ForkBackfillCandidate[];
  createdIssueNumbers: number[];
  reusedIssueNumbers: number[];
  terminalIssueNumbers: number[];
  updatedSnapshotPaths: string[];
}

export function planForkDependencyBackfill(input: {
  projects: any[];
  snapshots: any[];
}): ForkBackfillCandidate[];

export function observeForkBackfillParents(input: {
  projects: any[];
  snapshots: any[];
  token: string;
  observe?: (projects: any[], options: { token: string }) => Promise<any>;
  now?: string;
}): Promise<{
  candidates: ForkBackfillCandidate[];
  updatedSnapshots: any[];
}>;

export function applyForkDependencyBackfill(input: {
  candidates: ForkBackfillCandidate[];
  repository: string;
  request: (
    path: string,
    options?: { method?: string; body?: string },
  ) => Promise<any>;
  apply: boolean;
  updatedSnapshotPaths?: string[];
}): Promise<BackfillReport>;
