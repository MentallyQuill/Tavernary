export const TAVERNARY_ORIGIN: "https://mentallyquill.github.io";
export const TAVERNARY_TARGET_MANIFEST_URL: "https://mentallyquill.github.io/Tavernary/security/tavernkeeper-targets.json";

export interface PublicManifestFetchOptions {
  timeoutMs?: number;
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

export function manifestDigest(manifestOrPath: unknown): string;

export function readPublicManifest(
  url: string,
  options?: PublicManifestFetchOptions,
): Promise<Record<string, unknown>>;

export function verifyPublicManifest(
  url: string,
  expectedDigest: string,
  options?: PublicManifestFetchOptions,
): Promise<Record<string, unknown>>;
