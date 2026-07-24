import type { ReadmeSource } from "./readme-source.d.mts";

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
  capabilities: string[];
};
export type RegistryRecord = {
  id: string;
  name: string;
  kind: string;
  metadata_status: "provisional" | "curated";
  summary: string;
  visibility: "published" | "quarantined" | "disabled";
  frontends?: string[];
  source: { type: string; repository: string };
};
export type GithubSnapshot = Record<string, unknown>;
export type EnrichmentProvider = {
  generate(input: EnrichmentInput): Promise<EnrichmentOutput>;
};

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
