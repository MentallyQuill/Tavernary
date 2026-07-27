export interface ForkDependency {
  repositoryId: number;
  name: string;
  repository: string;
  canonicalUrl: string;
  issueNumber: number | null;
}

export interface SubmissionRepositoryParent {
  repositoryId: number;
  name: string;
  repository: string;
  canonicalUrl: string;
}

export interface SubmissionRepositoryObservation {
  visibility: "public" | "private";
  archived: boolean;
  fork: boolean;
  parent: SubmissionRepositoryParent | null;
}

export interface ForkDependencyProject {
  id: string;
  visibility: string;
  repositoryId?: number | null;
  source: {
    type: string;
    repository_id?: number | null;
  };
}

export interface SubmissionLookup {
  issueNumber: number;
  state: "open" | "merged" | "declined";
}

export type ForkDependencyDecision =
  | { status: "none" }
  | { status: "published"; parentProjectId: string }
  | {
      status: "not-listed";
      dependency: ForkDependency;
      attention?: "cycle" | "depth-limit";
    }
  | { status: "waiting"; dependency: ForkDependency };

export function classifyForkDependency(input: {
  repository: SubmissionRepositoryObservation | undefined;
  projects: ForkDependencyProject[];
  priorSubmission: SubmissionLookup | null;
  ancestryRepositoryIds: number[];
}): ForkDependencyDecision;
