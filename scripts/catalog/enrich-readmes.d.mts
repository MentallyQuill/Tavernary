import type { ReadmeSource } from "./readme-source.d.mts";
import type { ProjectAttemptResult } from "./enrichment-run-state.d.mts";

export type VocabularyEntry = { id: string; label?: string };
export type EnrichmentInput = {
  id: string;
  name: string;
  kind: string;
  repository: string;
  repositoryDescription: string | null;
  readmeText: string | null;
  frontends: string[];
  allowedPrimaryFunctions: VocabularyEntry[];
  allowedCapabilities: VocabularyEntry[];
};
export type EnrichmentOutput = {
  summary: string;
  metadata_status: "curated";
  primary_function: string;
  capabilities: readonly string[];
};
export type RegistryRecord = {
  id: string;
  name?: string;
  kind?: string;
  metadata_status?: string;
  summary?: string;
  visibility?: string;
  frontends?: string[];
  source?: {
    type: string;
    repository: string;
    repository_id?: number | null;
  };
  path?: string;
  [key: string]: unknown;
};
export type GithubSnapshot = Record<string, unknown>;
export type EnrichmentProvider = {
  generate(input: EnrichmentInput): Promise<{
    output: EnrichmentOutput;
    metadata: {
      requestedModel: "MiniMax-M3";
      returnedModel: string | null;
      latencyMs: number;
    };
  }>;
};
export type EnrichmentOptions = {
  startIndex?: number;
  batchSize?: number;
  projectId?: string;
  force?: boolean;
  mode?: "backfill";
  vocabularies?: {
    primaryFunctions: VocabularyEntry[];
    capabilities: VocabularyEntry[];
  };
};

export function selectEnrichmentRecords(
  records: RegistryRecord[],
  options?: EnrichmentOptions,
): RegistryRecord[];

export function enrichRecord(
  record: RegistryRecord,
  snapshot: GithubSnapshot,
  provider: EnrichmentProvider,
  options?: {
    force?: boolean;
    vocabularies?: {
      primaryFunctions: VocabularyEntry[];
      capabilities: VocabularyEntry[];
    };
    loadSource?: (
      record: RegistryRecord,
      snapshot: GithubSnapshot,
      options?: Record<string, unknown>,
    ) => Promise<ReadmeSource>;
  },
): Promise<EnrichmentOutput | null>;

export function writeEnrichedRecord(
  path: string,
  record: RegistryRecord,
  output: EnrichmentOutput,
  vocabularies?: {
    primaryFunctions: readonly (string | VocabularyEntry)[];
    capabilities: readonly (string | VocabularyEntry)[];
  },
): Promise<void>;

export function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]>;

export function runEnrichmentBatch(options: {
  projectIds: string[];
  recordsById: Record<string, RegistryRecord>;
  snapshotsById: Record<string, GithubSnapshot>;
  phase: "primary" | "retry";
  vocabularies: {
    primaryFunctions: VocabularyEntry[];
    capabilities: VocabularyEntry[];
  };
  provider: EnrichmentProvider;
  validateSnapshot: (snapshot: unknown) => boolean;
  concurrency?: number;
  loadSource?: (
    record: RegistryRecord,
    snapshot: GithubSnapshot,
    options?: Record<string, unknown>,
  ) => Promise<ReadmeSource>;
  writeRecord?: (
    record: RegistryRecord,
    output: EnrichmentOutput,
    vocabularies: {
      primaryFunctions: VocabularyEntry[];
      capabilities: VocabularyEntry[];
    },
  ) => Promise<void>;
}): Promise<ProjectAttemptResult[]>;

export function runCli(
  options?: EnrichmentOptions,
): Promise<Record<string, unknown>>;
