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
  record: {
    source?: {
      type?: string;
      repository_id?: number | null;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
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
  manifest: {
    operation: "edit-card" | "move-source" | "delist";
    source_fingerprint: string;
    original: Record<string, unknown>;
    proposed: Record<string, unknown>;
  };
  record: Record<string, unknown>;
  currentFingerprint?: string;
}

export type OwnerConflictDecision =
  | { conflict: false; warnings: string[] }
  | {
      conflict: true;
      reasonCode: "stale-owner-request";
      fields: string[];
      warnings: string[];
    };

export function verifyProjectOwnerAuthority(
  input: OwnerAuthorityInput,
): OwnerAuthorityDecision;

export function detectOwnerRequestConflict(
  input: OwnerConflictInput,
): OwnerConflictDecision;
