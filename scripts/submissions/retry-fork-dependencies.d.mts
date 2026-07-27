export interface ForkDependencyProjectRecord {
  id: string;
  source?: {
    type: string;
    repository_id?: number | null;
  };
}

export interface ForkDependencyComment {
  body?: string | null;
}

export type ForkDependencyRetryRequest = (
  path: string,
  options?: { method?: string; body?: string },
) => Promise<any>;

export function hasTerminalForkDependency(input: {
  comments: ForkDependencyComment[];
  projectsByRepositoryId: Map<number, ForkDependencyProjectRecord>;
  closedUpstreamIssueNumber?: number;
}): boolean;

export function retryForkDependencies(input: {
  repository: string;
  ref?: string;
  projects: ForkDependencyProjectRecord[];
  closedUpstreamIssueNumber?: number;
  request: ForkDependencyRetryRequest;
}): Promise<number[]>;
