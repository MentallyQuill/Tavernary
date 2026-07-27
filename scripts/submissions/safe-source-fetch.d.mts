export interface SafeProbeAddress {
  address: string;
  family: number;
}

export interface SafeProbeOptions {
  fetchImpl?: typeof fetch;
  lookup?: (
    hostname: string,
    options: { all: true; verbatim: true },
  ) => Promise<SafeProbeAddress | SafeProbeAddress[]>;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  allowedRedirectHosts?: Set<string>;
  headers?: Record<string, string>;
}

export interface SafeProbeResult {
  finalUrl: string;
  status: number;
  contentType: string | null;
  contentLength: number | null;
  redirects: string[];
}

export interface SafeReadResult extends SafeProbeResult {
  body: Uint8Array;
}

export function safeProbe(
  value: string,
  options?: SafeProbeOptions,
): Promise<SafeProbeResult>;

export function safeReadSource(
  value: string,
  options?: SafeProbeOptions,
): Promise<SafeReadResult>;
