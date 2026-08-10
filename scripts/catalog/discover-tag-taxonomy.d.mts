import type { TagFacet, TagProjectKind } from "./tag-vocabulary.mjs";

export interface TagCandidate {
  phrase: string;
  canonicalPhrase: string;
  facet: TagFacet;
  aliases: string[];
  evidence: string[];
}

export interface TagCandidateObservation {
  projectId: string;
  kind: TagProjectKind;
  candidates: TagCandidate[];
}

export interface TagCandidateReport {
  schema_version: 1;
  project_count: number;
  candidates: Array<{
    id: string;
    label: string;
    facet: TagFacet;
    frequency: number;
    applicable_kinds: TagProjectKind[];
    representative_projects: Array<{
      project_id: string;
      evidence: string[];
    }>;
    aliases: string[];
    warnings: string[];
  }>;
}

export interface TaxonomyDiscoveryCard {
  id: string;
  source_id: string;
  name: string;
  kind: TagProjectKind;
}

export interface TaxonomySourceEvidence {
  readme: string | null;
  repositoryDescription: string | null;
}

export interface TaxonomyProviderInput {
  sources: Array<{
    sourceId: string;
    readme: string | null;
    repositoryDescription: string | null;
  }>;
  projects: Array<{
    id: string;
    sourceId: string;
    name: string;
    kind: TagProjectKind;
  }>;
}

export interface TaxonomyDiscoveryProvider {
  discover(input: TaxonomyProviderInput): Promise<TagCandidateObservation[]>;
}

export interface TaxonomyCorpus {
  cards: TaxonomyDiscoveryCard[];
  evidenceBySource: Map<string, TaxonomySourceEvidence>;
}

export function createTaxonomyDiscoveryProvider(
  options: ProviderConfiguration & {
    jsonRepair?: ProviderConfiguration;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    now?: () => number;
  },
): TaxonomyDiscoveryProvider;

export function normalizeTagCandidateId(value: string): string;

export function buildTagCandidateReport(
  observations: TagCandidateObservation[],
): TagCandidateReport;

export function discoverTagTaxonomy(input: {
  cards: TaxonomyDiscoveryCard[];
  evidenceBySource: ReadonlyMap<string, TaxonomySourceEvidence>;
  provider: TaxonomyDiscoveryProvider;
  batchSize?: number;
}): Promise<TagCandidateReport>;

export function writeTagCandidateReport(
  report: TagCandidateReport,
  outputPath: string,
): Promise<void>;

export function loadTaxonomyCorpus(options?: {
  repositoryRoot?: string;
  evidenceRoot?: string;
}): Promise<TaxonomyCorpus>;

export function runTagTaxonomyDiscoveryCli(
  arguments_: string[],
  options?: {
    repositoryRoot?: string;
    outputPath?: string;
    corpus?: TaxonomyCorpus;
    provider?: TaxonomyDiscoveryProvider;
    logger?: { log(message: string): void };
  },
): Promise<TagCandidateReport>;
import type { ProviderConfiguration } from "./enrichment-provider.mjs";
