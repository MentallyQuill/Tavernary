import type { SourceRecord } from "../../src/features/catalog/source-record.mjs";
import type { ProjectOwnerManifest } from "../../src/features/help/project-owner-manifest.mjs";

export interface GitHubRepositoryIdentity {
  id: number;
  fullName: string;
  htmlUrl: string;
  visibility: string;
  owner: { login: string; type: string };
}

export interface OwnerAuthorityInput {
  issueAuthor: string;
  manifestRepositoryId: number | null;
  source: SourceRecord | Record<string, unknown>;
  repository: GitHubRepositoryIdentity;
  [key: string]: unknown;
}

export type OwnerAuthorityDecision =
  | {
      authorized: true;
      authorityType: "repository-owner";
      actorLogin: string;
      ownerLogin: string;
    }
  | { authorized: false; reasonCode: string };

export interface OwnerConflictInput {
  manifest:
    | ProjectOwnerManifest
    | {
        operation: string;
        project_fingerprint?: string;
        source_fingerprint?: string;
      };
  project?: Record<string, unknown>;
  source?: Record<string, unknown>;
  currentProjectFingerprint?: string;
  currentSourceFingerprint?: string;
}

export type OwnerConflictDecision =
  | { conflict: false; warnings: string[] }
  | {
      conflict: true;
      reasonCode: "stale-owner-request" | "unsupported-owner-operation";
      fields: string[];
      warnings: string[];
    };

export function verifyProjectOwnerAuthority(
  input: OwnerAuthorityInput,
): OwnerAuthorityDecision;

export function detectOwnerRequestConflict(
  input: OwnerConflictInput,
): OwnerConflictDecision;
