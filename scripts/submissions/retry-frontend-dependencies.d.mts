import type { FrontendProject } from "./frontend-reconciliation.mjs";

export interface RetryIssue {
  number: number;
  state: string;
  labels: Array<string | { name: string }>;
  pull_request?: unknown;
}

export interface FrontendSourceRecord {
  id: string;
  type: string;
  repository?: string;
  url?: string;
}

export type FrontendDependencyRetryRequest = (
  path: string,
  options?: { method?: string; body?: string },
) => Promise<any>;

export function indexedFrontendUrls(
  projects: FrontendProject[],
  sourcesById: Record<string, FrontendSourceRecord>,
): Set<string>;

export function hasResolvableFrontendDependency(input: {
  comments: Array<{ body?: string | null }>;
  indexedUrls: Set<string>;
}): boolean;

export function retryFrontendDependencies(input: {
  repository: string;
  ref?: string;
  projects: FrontendProject[];
  sources: FrontendSourceRecord[];
  request: FrontendDependencyRetryRequest;
}): Promise<number[]>;
