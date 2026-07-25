import type { ReadmeSource } from "./readme-source.d.mts";
import type {
  EnrichmentRunState,
  ProjectAttemptResult,
} from "./enrichment-run-state.d.mts";

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
  repair?: {
    reasonCode: string;
    message: string;
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
  previousEntries?: EnrichmentRunState["entries"];
}): Promise<ProjectAttemptResult[]>;

export type RunCliOptions = Omit<EnrichmentOptions, "mode"> & {
  providerConfiguration?: {
    apiUrl?: string;
    apiKey?: string;
    model?: string;
  };
  provider?: EnrichmentProvider;
  timeoutMs?: number;
  records?: RegistryRecord[];
  snapshots?: Record<string, GithubSnapshot> | GithubSnapshot[];
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
