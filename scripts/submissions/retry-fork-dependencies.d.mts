export interface ForkDependencySourceRecord {
  id: string;
  type: string;
  repository_id?: number | null;
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
  sourcesByRepositoryId: Map<number, ForkDependencySourceRecord>;
  closedUpstreamIssueNumber?: number;
}): boolean;

export function retryForkDependencies(input: {
  repository: string;
  ref?: string;
  sources: ForkDependencySourceRecord[];
  closedUpstreamIssueNumber?: number;
  request: ForkDependencyRetryRequest;
}): Promise<number[]>;
