import type { FrontendProject } from "./frontend-reconciliation.mjs";

export interface RetryIssue {
  number: number;
  state: string;
  labels: Array<string | { name: string }>;
  pull_request?: unknown;
}

export type FrontendDependencyRetryRequest = (
  path: string,
  options?: { method?: string; body?: string },
) => Promise<any>;

export function indexedFrontendUrls(projects: FrontendProject[]): Set<string>;

export function hasResolvableFrontendDependency(input: {
  comments: Array<{ body?: string | null }>;
  indexedUrls: Set<string>;
}): boolean;

export function retryFrontendDependencies(input: {
  repository: string;
  ref?: string;
  projects: FrontendProject[];
  request: FrontendDependencyRetryRequest;
}): Promise<number[]>;
