export function formatSnapshot(snapshot: unknown): Promise<string>;
export function snapshotForFailure<
  T extends { source_health: string; stale_since: string | null },
>(prior: T, error: { status?: number; rateLimited?: boolean }, now: string): T;
export function repositoryIdentityChanged(
  record: { id: string; source: { repository_id: number | null } },
  repository: { id: number },
): boolean;
export function identityChangeSnapshot(input: {
  record: { id: string; source: { repository_id: number | null } };
  repository: Record<string, unknown>;
  previous: Record<string, unknown> | null;
  now: string;
}): {
  source_health: string;
  repository: { id: number; [key: string]: unknown };
  activity: unknown;
  license: unknown;
  stale_since: string | null;
  [key: string]: unknown;
};
export function refreshSelectedProjects(
  records: Array<{ id: string }>,
  refresh?: (
    record: { id: string },
  ) => Promise<{ source_health: string; refreshed_at: string } | null>,
  logger?: { log(message: string): void; error(message: string): void },
): Promise<void>;
