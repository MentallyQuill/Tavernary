import type {
  SafeReadResult,
  SafeProbeOptions,
} from "../submissions/safe-source-fetch.d.mts";

export type RedditSourceReasonCode =
  | "unsupported-enrichment-source"
  | "reddit-post-unavailable"
  | "reddit-identity-mismatch"
  | "reddit-rate-limited"
  | "reddit-server-error"
  | "reddit-response-invalid"
  | "reddit-fetch-failed";

export type RedditEnrichmentSource =
  | {
      status: "ready";
      sourceKind: "reddit-body" | "reddit-title";
      text: string;
      sourceIdentity: string;
      redditPostId: string;
    }
  | {
      status: "failed";
      reasonCode: RedditSourceReasonCode;
      message: string;
      sourceIdentity?: string;
      redditPostId?: string;
    };

export type RedditSourceReader = (
  value: string,
  options?: SafeProbeOptions,
) => Promise<SafeReadResult>;

export function loadRedditEnrichmentSource(
  record: Record<string, unknown>,
  options?: {
    readSource?: RedditSourceReader;
  },
): Promise<RedditEnrichmentSource>;
