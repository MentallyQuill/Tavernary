export interface EvidenceSource {
  id: string;
  type: "github" | "codeberg";
  repository: string;
  repository_id: number;
}

export interface EvidenceProjectReference {
  id: string;
  source_id: string;
}

export interface EvidenceSelection {
  all: boolean;
  sourceIds: string[];
  projectIds: string[];
}

export interface EvidenceFetchInput {
  source: EvidenceSource;
  etag: string | null;
  commitSha: string | null;
}

export interface FetchedEvidence {
  status: "fetched";
  readmeFilename: string;
  readmeBytes: Uint8Array;
  readmePath: string;
  downloadUrl: string;
  repositoryDescription: string | null;
  defaultBranch: string;
  commitSha: string;
  etag: string | null;
}

export type EvidenceFetchResult =
  | { status: "unchanged"; checkedAt: string }
  | FetchedEvidence
  | { status: "missing"; repositoryDescription: string | null };

export interface EvidenceAdapter {
  fetch(input: EvidenceFetchInput): Promise<EvidenceFetchResult>;
}

export interface EvidenceRefreshEntry {
  sourceId: string;
  status: EvidenceFetchResult["status"] | "failed";
  message?: string;
}

export interface EvidenceRefreshReport {
  fetched: number;
  unchanged: number;
  missing: number;
  failed: number;
  entries: EvidenceRefreshEntry[];
}

export interface EvidenceAdapterOptions {
  githubApi?: (endpoint: string) => Promise<unknown>;
  codebergApi?: (endpoint: string) => Promise<unknown>;
  clock?: () => string;
}

export interface EvidenceRegistryContext {
  sources: Array<EvidenceSource | { id: string; type: string }>;
  projects: EvidenceProjectReference[];
}

export interface EvidenceCliOptions {
  repositoryRoot?: string;
  root?: string;
  registryContext?: EvidenceRegistryContext;
  adapter?: EvidenceAdapter;
  clock?: () => string;
  logger?: { log(message: string): void };
}

export function evidenceDirectory(root: string, source: EvidenceSource): string;

export function parseEvidenceArguments(arguments_: string[]): EvidenceSelection;

export function selectEvidenceSources(input: {
  sources: Array<EvidenceSource | { id: string; type: string }>;
  projects: EvidenceProjectReference[];
  selection: EvidenceSelection;
}): EvidenceSource[];

export function refreshCatalogEvidence(input: {
  root: string;
  sources: EvidenceSource[];
  adapter: EvidenceAdapter;
  clock?: () => string;
}): Promise<EvidenceRefreshReport>;

export function createEvidenceAdapter(
  options?: EvidenceAdapterOptions,
): EvidenceAdapter;

export function runCatalogEvidenceCli(
  arguments_: string[],
  options?: EvidenceCliOptions,
): Promise<EvidenceRefreshReport>;
