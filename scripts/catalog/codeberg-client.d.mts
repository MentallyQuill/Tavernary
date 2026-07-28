export interface CodebergRateLimit {
  limit: number | null;
  remaining: number | null;
  resetSeconds: number | null;
}

export interface CodebergRequestOptions {
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maximumBodyBytes?: number;
}

export class CodebergRequestError extends Error {
  status: number | null;
  retryable: boolean;
  code: string;
}

export function parseCodebergRateLimit(
  headers: Headers,
): CodebergRateLimit | null;

export function codebergRequest<T = unknown>(
  path: string,
  options?: CodebergRequestOptions,
): Promise<{ data: T; status: number; rateLimit: CodebergRateLimit | null }>;

export function listReleases(
  repository: string,
  options?: CodebergRequestOptions,
): Promise<{ data: unknown[]; requestCount: number }>;
