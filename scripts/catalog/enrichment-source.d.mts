import type { ReadmeSource } from "./readme-source.d.mts";
import type {
  RedditEnrichmentSource,
  RedditSourceReader,
} from "./reddit-enrichment-source.d.mts";

export type EnrichmentSourceKind =
  | "readme"
  | "description"
  | "reddit-body"
  | "reddit-title"
  | "confirmed-fallback";

export type EnrichmentSource =
  | {
      status: "ready";
      sourceKind: Exclude<EnrichmentSourceKind, "confirmed-fallback">;
      sourceIdentity: string;
      text: string;
      repositoryDescription?: string | null;
      readmeText?: string | null;
      repositoryId?: number;
      headSha?: string;
      readmePath?: string | null;
      readmeRef?: string | null;
      redditPostId?: string;
    }
  | {
      status: "fallback";
      sourceKind: "confirmed-fallback";
      sourceIdentity: string;
      repositoryId?: number;
      headSha?: string;
      readmePath?: null;
      readmeRef?: string | null;
    }
  | {
      status: "source-not-ready" | "failed";
      reasonCode: string;
      message: string;
      sourceIdentity?: string;
      redditPostId?: string;
    };

export interface EnrichmentSourceRecord {
  source?: {
    type?: string;
    repository?: string;
    url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface EnrichmentSourceOptions {
  loadRepository?: (
    record: EnrichmentSourceRecord,
    snapshot: Record<string, unknown> | undefined,
    options?: Record<string, unknown>,
  ) => Promise<ReadmeSource>;
  loadReddit?: (
    record: EnrichmentSourceRecord,
    options?: { readSource?: RedditSourceReader },
  ) => Promise<RedditEnrichmentSource>;
  readSource?: RedditSourceReader;
  [key: string]: unknown;
}

export function loadEnrichmentSource(
  record: EnrichmentSourceRecord,
  snapshot: Record<string, unknown> | undefined,
  options?: EnrichmentSourceOptions,
): Promise<EnrichmentSource>;
