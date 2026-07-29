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
      readmeIdentity?: string | null;
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
  id: string;
  source_id?: string;
  [key: string]: unknown;
}

export interface EnrichmentSourceContext {
  id: string;
  type?: string;
  repository?: string;
  url?: string;
  [key: string]: unknown;
}

export interface EnrichmentSourceOptions {
  loadRepository?: (
    source: EnrichmentSourceContext,
    snapshot: Record<string, unknown> | undefined,
    options?: Record<string, unknown>,
  ) => Promise<ReadmeSource>;
  loadReddit?: (
    source: EnrichmentSourceContext,
    options?: { readSource?: RedditSourceReader },
  ) => Promise<RedditEnrichmentSource>;
  providers?: Record<
    string,
    {
      readRootReadme(input: {
        repository: string;
        ref: string;
      }): Promise<Record<string, unknown> | null>;
    }
  >;
  readSource?: RedditSourceReader;
  [key: string]: unknown;
}

export function loadEnrichmentSource(
  record: EnrichmentSourceRecord,
  source: EnrichmentSourceContext,
  snapshot: Record<string, unknown> | undefined,
  options?: EnrichmentSourceOptions,
): Promise<EnrichmentSource>;
