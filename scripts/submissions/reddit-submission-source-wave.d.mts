import type {
  EnrichmentSource,
  EnrichmentSourceContext,
  EnrichmentSourceRecord,
} from "../catalog/enrichment-source.mjs";

export type RedditSourceWaveFailure = {
  status: "failed";
  reasonCode: string;
  message: string;
  sourceIdentity?: string;
  redditPostId?: string;
};

export type RedditSourceWaveResult =
  | {
      status: "ready";
      source: Extract<EnrichmentSource, { status: "ready" }>;
      attempts: number;
    }
  | {
      status: "blocked" | "exhausted";
      failure: RedditSourceWaveFailure;
      attempts: number;
    };

export const REDDIT_SOURCE_BACKOFF_MS: readonly [30_000, 60_000];

export function redditSourceFailureClass(
  reasonCode: string | undefined,
): "availability" | "integrity";

export function loadRedditSubmissionSourceWave(input: {
  project: EnrichmentSourceRecord;
  source: EnrichmentSourceContext;
  snapshot?: Record<string, unknown> | null;
  loadSource?: (
    project: EnrichmentSourceRecord,
    source: EnrichmentSourceContext,
    snapshot: Record<string, unknown> | null,
  ) => Promise<EnrichmentSource | Record<string, unknown> | null | undefined>;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<RedditSourceWaveResult>;
