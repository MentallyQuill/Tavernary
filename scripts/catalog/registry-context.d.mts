import type { SourceRecord } from "../../src/features/catalog/source-record.mjs";

export interface RegistryProject {
  id: string;
  source_id: string;
  [key: string]: unknown;
}

export interface RegistrySnapshot {
  source_id: string;
  [key: string]: unknown;
}

export interface RegistryContext {
  projects: RegistryProject[];
  sources: SourceRecord[];
  snapshots: RegistrySnapshot[];
  projectsById: Map<string, RegistryProject>;
  sourcesById: Map<string, SourceRecord>;
  projectsBySourceId: Map<string, RegistryProject[]>;
  snapshotsBySourceId: Map<string, RegistrySnapshot>;
  sourcesByRepositoryKey: Map<string, SourceRecord>;
}

export class RegistryIntegrityError extends Error {
  code: string;
  constructor(code: string, message: string);
}

export function indexRegistry(input: {
  projects: RegistryProject[];
  sources: SourceRecord[];
  snapshots: RegistrySnapshot[];
}): RegistryContext;
export function loadRegistryContext(root?: string): Promise<RegistryContext>;
