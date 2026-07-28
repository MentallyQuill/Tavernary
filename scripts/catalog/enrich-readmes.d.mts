import type { EnrichmentSource } from "./enrichment-source.d.mts";
import type {
  EnrichmentRunState,
  ProjectAttemptResult,
} from "./enrichment-run-state.d.mts";

export const PREFLIGHT_RETRY_DELAYS_MS: readonly [5000, 15000, 30000];

export type VocabularyEntry = { id: string; label?: string };
export type EnrichmentInput = {
  id: string;
  name: string;
  kind: string;
  source: {
    kind: string;
    identity: string;
    text: string;
  };
  frontends: string[];
  allowedPrimaryFunctions: VocabularyEntry[];
  allowedCapabilities: VocabularyEntry[];
  repair?: {
    reasonCode: string;
    message: string;
    rejectedSummary?: string;
  };
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
  enrichment_policy?: "automatic" | "manual";
  enrichment_note?: string;
  summary?: string;
  visibility?: string;
  frontends?: string[];
  source?: {
    type: string;
    repository?: string;
    url?: string;
    repository_id?: number | null;
  };
  path?: string;
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
  vocabularies?: {
    primaryFunctions: VocabularyEntry[];
    capabilities: VocabularyEntry[];
  };
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
  options?: { force?: boolean },
): RegistryRecord[];

export function enrichRecord(
  record: RegistryRecord,
  snapshot: RepositorySnapshot,
  provider: EnrichmentProvider,
  options?: {
    force?: boolean;
    vocabularies?: {
      primaryFunctions: VocabularyEntry[];
      capabilities: VocabularyEntry[];
    };
    loadSource?: (
      record: RegistryRecord,
      snapshot: RepositorySnapshot | undefined,
      options?: Record<string, unknown>,
    ) => Promise<EnrichmentSource>;
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
  snapshotsById: Record<string, RepositorySnapshot>;
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
    snapshot: RepositorySnapshot | undefined,
    options?: Record<string, unknown>,
  ) => Promise<EnrichmentSource>;
  writeRecord?: (
    record: RegistryRecord,
    output: EnrichmentOutput,
    vocabularies: {
      primaryFunctions: VocabularyEntry[];
      capabilities: VocabularyEntry[];
    },
  ) => Promise<void>;
  previousEntries?: EnrichmentRunState["entries"];
  force?: boolean;
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
    snapshot: RepositorySnapshot | undefined,
    options?: Record<string, unknown>,
  ) => Promise<EnrichmentSource>;
  writeRecord?: (
    record: RegistryRecord,
    output: EnrichmentOutput,
    vocabularies: {
      primaryFunctions: VocabularyEntry[];
      capabilities: VocabularyEntry[];
    },
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
