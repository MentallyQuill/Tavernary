import type { SourceRecord } from "../../src/features/catalog/source-record.mjs";

export interface LegacyProject {
  schema_version: 5;
  id: string;
  source: {
    type: "github" | "codeberg" | "github-organization" | "url";
    [key: string]: unknown;
  };
  visibility: "published" | "quarantined" | "disabled";
  visibility_reason: string | null;
  refresh_policy: "automatic" | "paused";
  [key: string]: unknown;
}

export interface MigrationMetadata {
  tags: string[];
  metadata_policy: {
    summary: { mode: "automatic" | "manual"; note?: string };
    tags: { mode: "automatic" | "manual"; note?: string };
  };
}

export interface LegacyRepositorySnapshot {
  schema_version: 3;
  project_id: string;
  [key: string]: unknown;
}

export interface SourceMigrationOperation {
  kind: "create" | "update" | "delete";
  path: string;
  value?: unknown;
}

export interface SourceMigrationPlan {
  counts: {
    projects: number;
    sources: number;
    snapshots: number;
    delistedSources: number;
  };
  projects: Array<Record<string, unknown>>;
  sources: SourceRecord[];
  snapshots: Array<Record<string, unknown> & { source_id: string }>;
  refreshManifest: Record<string, unknown>;
  operations: SourceMigrationOperation[];
}

export class SourceMigrationConflictError extends Error {
  code: "conflicting-source-identity";
  sourceId: string;
  projectIds: string[];
  constructor(input: { sourceId: string; projectIds: string[] });
}

export interface SourceMigrationReport {
  written: boolean;
  paths: string[];
}

export function planSourceRegistryMigration(input: {
  projects: LegacyProject[];
  snapshots: LegacyRepositorySnapshot[];
  refreshManifest: Record<string, unknown> & {
    project_timings?: Array<Record<string, unknown> & { project_id: string }>;
  };
  metadataByProjectId:
    Record<string, MigrationMetadata> | Map<string, MigrationMetadata>;
}): SourceMigrationPlan;
export function writeSourceRegistryMigration(
  plan: SourceMigrationPlan,
  options: {
    root: string;
    write?: boolean;
    validatePlan?: (plan: SourceMigrationPlan) => Promise<void> | void;
    writeFile?: (path: string, content: string) => Promise<unknown>;
    rename?: (from: string, to: string) => Promise<unknown>;
    remove?: (path: string, options?: { force?: boolean }) => Promise<unknown>;
    mkdir?: (
      path: string,
      options?: { recursive?: boolean },
    ) => Promise<unknown>;
    access?: (path: string) => Promise<unknown>;
  },
): Promise<SourceMigrationReport>;
