export function serverResponds(
  url: string,
  options?: {
    fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<boolean>;

export function fetchBounded(
  url: string,
  options?: {
    fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<Response>;

export function cleanupFixture(
  fixture: { cleanup(): Promise<void> } | null,
  options?: {
    hasPrimaryFailure?: boolean;
    logError?: typeof console.error;
  },
): Promise<void>;
