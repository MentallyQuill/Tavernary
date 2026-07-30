import type { EnrichmentSource } from "./enrichment-source.d.mts";
import type {
  CatalogCopyChangeReason,
  CatalogCopyPolicySignal,
  CatalogCopyResultStatus,
} from "./catalog-copy-contract.mjs";
import type {
  EnrichmentRunState,
  ProjectAttemptResult,
} from "./enrichment-run-state.d.mts";

export const PREFLIGHT_RETRY_DELAYS_MS: readonly [5000, 15000, 30000];
export const MODEL_RATE_LIMIT_BACKOFF_DELAYS_MS: readonly [5000, 15000, 30000];

export type MetadataField = "summary" | "tags";

export type TagDefinition = {
  id: string;
  label: string;
  facet: string;
  description: string;
  aliases: string[];
  applicable_kinds: string[];
  inclusion_guidance: string[];
  exclusion_guidance?: string[];
};

export type TagVocabulary = {
  schema_version?: number;
  tags: TagDefinition[];
};

export type EnrichmentInput = {
  id: string;
  sourceId: string;
  name: string;
  kind: string;
  requestedFields: readonly MetadataField[];
  vocabularyHash: string;
  evidence: {
    readme: { identity: string; text: string } | null;
    repositoryDescription: string | null;
  };
  protectedTerms: readonly string[];
  policyVersion: string;
  source: {
    kind: string;
    identity: string;
    text: string;
  };
  frontends: string[];
  allowedTags: TagDefinition[];
  repair?: {
    reasonCode: string;
    message: string;
    rejectedSummary?: string;
  };
};

export type EnrichmentOutput = {
  summary?: { value: string; evidence: string[] };
  tags?: Array<{ id: string; evidence: string[] }>;
  result?: CatalogCopyResultStatus;
  change_reasons?: readonly CatalogCopyChangeReason[];
  policy_signal?: CatalogCopyPolicySignal;
  tag_generation_diagnostic?: "invalid-output-fell-back-empty";
};

export type RegistryRecord = {
  id: string;
  source_id: string;
  name?: string;
  kind?: string;
  metadata_status?: string;
  summary?: string;
  tags?: string[];
  metadata_policy?: {
    summary?: { mode?: "automatic" | "manual"; note?: string };
    tags?: { mode?: "automatic" | "manual"; note?: string };
  };
  listing_status?: string;
  frontends?: string[];
  primary_function?: string;
  path?: string;
  [key: string]: unknown;
};

export type SourceRecord = {
  id: string;
  type: string;
  repository?: string;
  url?: string;
  repository_id?: number | null;
  [key: string]: unknown;
};

export type RepositorySnapshot = Record<string, unknown>;

export type EnrichmentProvider = {
  generate(input: EnrichmentInput): Promise<{
    output: EnrichmentOutput;
    metadata: {
      requestedModel: string;
      returnedModel: string | null;
      latencyMs: number;
    };
  }>;
};

export type EnrichmentOptions = {
  mode?:
    | "preflight"
    | "canary"
    | "approve-canary"
    | "record-canary-publication"
    | "record-full-publication"
    | "record-full-deployment"
    | "authorize-full"
    | "start"
    | "resume";
  batchSize?: number;
  concurrency?: number;
  projectIds?: string[];
  reportPath?: string | null;
  canaryReportPath?: string | null;
  selectionMode?: "pending" | "all-automatic";
  vocabularies?: TagVocabulary;
};

export type PreflightResult = {
  mode: "preflight";
  status: "passed";
  requested_model: string;
  returned_model: string | null;
  latency_ms: number;
  validation_status: "passed";
};

export type FullAuthorizationResult = {
  mode: "authorize-full";
  status: "passed";
  canary_run_id: string;
  requested_model: string;
};

export function selectEnrichmentRecords(
  records: RegistryRecord[],
  sourcesById: Record<string, SourceRecord>,
  options?: { force?: boolean },
): RegistryRecord[];

export function enrichRecord(
  record: RegistryRecord,
  source: SourceRecord,
  snapshot: RepositorySnapshot,
  provider: EnrichmentProvider,
  options?: {
    force?: boolean;
    vocabularies?: TagVocabulary;
    protectedTerms?: readonly string[];
    policyVersion?: string;
    loadSource?: (
      record: RegistryRecord,
      source: SourceRecord,
      snapshot: RepositorySnapshot | undefined,
      options?: Record<string, unknown>,
    ) => Promise<EnrichmentSource>;
    [key: string]: unknown;
  },
): Promise<EnrichmentOutput | null>;

export function writeEnrichedRecord(
  path: string,
  record: RegistryRecord,
  output: EnrichmentOutput,
  vocabularies?: TagVocabulary,
): Promise<void>;

export function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]>;

export function runEnrichmentBatch(options: {
  projectIds: string[];
  recordsById: Record<string, RegistryRecord>;
  sourcesById: Record<string, SourceRecord>;
  snapshotsBySourceId: Record<string, RepositorySnapshot>;
  phase: "primary" | "retry";
  vocabularies: TagVocabulary;
  provider: EnrichmentProvider;
  validateSnapshot: (snapshot: unknown) => boolean;
  concurrency?: number;
  loadSource?: (
    record: RegistryRecord,
    source: SourceRecord,
    snapshot: RepositorySnapshot | undefined,
    options?: Record<string, unknown>,
  ) => Promise<EnrichmentSource>;
  writeRecord?: (
    record: RegistryRecord,
    output: EnrichmentOutput,
    vocabularies: TagVocabulary,
  ) => Promise<void>;
  previousEntries?: EnrichmentRunState["entries"];
  force?: boolean;
  sleep?: (milliseconds: number) => Promise<void>;
  rateLimitBackoffDelays?: readonly number[];
}): Promise<ProjectAttemptResult[]>;

export type RunCliOptions = Omit<EnrichmentOptions, "mode"> & {
  providerConfiguration?: {
    apiUrl?: string;
    apiKey?: string;
    model?: string;
  };
  provider?: EnrichmentProvider;
  timeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  records?: RegistryRecord[];
  sources?: SourceRecord[];
  snapshots?: Record<string, RepositorySnapshot> | RepositorySnapshot[];
  snapshotSchema?: Record<string, unknown>;
  validateSnapshot?: (snapshot: unknown) => boolean;
  previousReport?: unknown;
  previousFullReport?: unknown;
  runId?: string;
  now?: string;
  commitSha?: string;
  deploymentRunId?: number;
  loadSource?: (
    record: RegistryRecord,
    source: SourceRecord,
    snapshot: RepositorySnapshot | undefined,
    options?: Record<string, unknown>,
  ) => Promise<EnrichmentSource>;
  writeRecord?: (
    record: RegistryRecord,
    output: EnrichmentOutput,
    vocabularies: TagVocabulary,
  ) => Promise<void>;
  writeReport?: (report: EnrichmentRunState) => Promise<void>;
};

export function runCli(
  options: RunCliOptions & {
    mode:
      | "canary"
      | "approve-canary"
      | "record-canary-publication"
      | "record-full-publication"
      | "record-full-deployment"
      | "start"
      | "resume";
  },
): Promise<EnrichmentRunState>;
export function runCli(
  options: RunCliOptions & { mode: "authorize-full" },
): Promise<FullAuthorizationResult>;
export function runCli(
  options?: RunCliOptions & { mode?: "preflight" },
): Promise<PreflightResult>;

export function cliOptions(argv: string[]): EnrichmentOptions;
