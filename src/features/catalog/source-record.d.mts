export type RepositoryProvider = "github" | "codeberg";
export type SourceStatus = "active" | "delisted";
export type SourceStatusReason = "removed" | null;
export type SourceRefreshPolicy = "automatic" | "paused";

interface SourceRecordBase {
  schema_version: 1;
  id: string;
  status: SourceStatus;
  status_reason: SourceStatusReason;
  refresh_policy: SourceRefreshPolicy;
}

export interface RepositorySourceRecord extends SourceRecordBase {
  type: RepositoryProvider;
  repository: string;
  repository_id: number;
}

export interface GitHubOrganizationSourceRecord extends SourceRecordBase {
  type: "github-organization";
  organization: string;
  url: string;
  refresh_policy: "paused";
}

export interface UrlSourceRecord extends SourceRecordBase {
  type: "url";
  url: string;
  published_at: string | null;
  version: string | null;
  artifact_size_bytes: number | null;
  license_status: "osi-approved" | "proprietary" | "missing" | "pending";
  license_spdx_id: string | null;
  refresh_policy: "paused";
}

export type SourceRecord =
  RepositorySourceRecord | GitHubOrganizationSourceRecord | UrlSourceRecord;

export type LegacySourceRecord =
  | {
      type: RepositoryProvider;
      repository: string;
      repository_id: number;
    }
  | {
      type: "github-organization";
      organization: string;
      url: string;
    }
  | {
      type: "url";
      url: string;
      published_at?: string | null;
      version?: string | null;
      artifact_size_bytes?: number | null;
      license_status?: "osi-approved" | "proprietary" | "missing" | "pending";
      license_spdx_id?: string | null;
    };

export interface LegacyProjectRecord {
  id: string;
  source: LegacySourceRecord;
}

export function repositorySourceId(
  provider: RepositoryProvider,
  repositoryId: number,
): string;
export function legacySourceId(project: LegacyProjectRecord): string;
export function canonicalSourceUrl(
  source:
    | Pick<RepositorySourceRecord, "type" | "repository">
    | Pick<GitHubOrganizationSourceRecord, "type" | "url">
    | Pick<UrlSourceRecord, "type" | "url">,
): string;
export function siblingProjectId(
  source:
    | Pick<RepositorySourceRecord, "id" | "type" | "repository">
    | Pick<GitHubOrganizationSourceRecord, "id" | "type">
    | Pick<UrlSourceRecord, "id" | "type">,
  title: string,
): string;
