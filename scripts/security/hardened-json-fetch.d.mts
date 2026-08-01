export interface HardenedJsonFetchOptions {
  url: string | URL;
  resourceLabel: string;
  assertInitialUrl: (url: URL) => void;
  assertRedirectUrl: (url: URL) => void;
  timeoutMs?: number;
  notFoundError?: () => Error;
  fetchImpl?: typeof fetch;
  requestImpl?: (
    url: string,
    options: {
      headers: Record<string, string>;
      signal: AbortSignal;
      lookup: (
        hostname: string,
        options: { all?: boolean },
        callback: (
          error: Error | null,
          address?: string | Array<{ address: string; family: number }>,
          family?: number,
        ) => void,
      ) => void;
    },
  ) => Promise<Response>;
  dnsLookup?: (
    hostname: string,
    options: { all: true },
  ) => Promise<Array<{ address: string; family: number }>>;
}

export function fetchHardenedJson(
  options: HardenedJsonFetchOptions,
): Promise<unknown>;
