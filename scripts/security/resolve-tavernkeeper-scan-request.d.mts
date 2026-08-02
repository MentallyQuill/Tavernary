export interface TavernKeeperScanRequest {
  sourceId: string;
  repositoryId: number;
  repositoryUrl: string;
}

export function resolveScanRequest(input: {
  repositoryUrl: string;
  actorId: number;
  operators: readonly number[];
  sources: readonly Record<string, unknown>[];
  projects: readonly Record<string, unknown>[];
}): TavernKeeperScanRequest;
