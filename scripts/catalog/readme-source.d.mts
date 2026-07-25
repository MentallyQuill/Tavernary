export type SourceReasonCode =
  | "missing-snapshot"
  | "invalid-snapshot"
  | "unhealthy-source"
  | "stale-source"
  | "project-mismatch"
  | "repository-mismatch"
  | "identity-mismatch"
  | "missing-permanent-identity"
  | "readme-fetch-failed"
  | "readme-rate-limited"
  | "readme-server-error"
  | "readme-unusable";

export type ReadmeSource =
  | {
      status: "ready";
      sourceKind: "description" | "readme";
      text: string;
      repositoryDescription: string | null;
      readmeText: string | null;
      readmePath: string | null;
      readmeRef: string | null;
      repositoryId: number;
      headSha: string;
    }
  | {
      status: "fallback";
      sourceKind: "confirmed-fallback";
      readmePath: null;
      readmeRef: string;
      repositoryId: number;
      headSha: string;
    }
  | {
      status: "source-not-ready" | "failed";
      reasonCode: SourceReasonCode;
      message: string;
    };

export type GithubClient = (
  path: string,
  options?: { ref?: string },
) => Promise<Record<string, unknown> | null>;

export function createSnapshotValidator(
  schema: Record<string, unknown>,
): (snapshot: unknown) => boolean;

export function assessSourceReadiness(
  record: Record<string, unknown>,
  snapshot: Record<string, unknown> | undefined,
  validateSnapshot: (snapshot: unknown) => boolean,
): ReadmeSource | { status: "ready"; snapshot: Record<string, unknown> };

export function loadReadmeSource(
  record: Record<string, unknown>,
  snapshot: Record<string, unknown> | undefined,
  options?: {
    github?: GithubClient;
    validateSnapshot?: (snapshot: unknown) => boolean;
  },
): Promise<ReadmeSource>;
