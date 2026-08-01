export interface TavernKeeperTarget {
  source_id: string;
  provider: "github";
  repository_id: number;
  repository: string;
  target_sha: string;
  canonical_url: string;
}

export interface TavernKeeperTargetManifest {
  schema_version: 1;
  generated_at: string;
  repositories: TavernKeeperTarget[];
}

export function buildTavernKeeperTargets(options: {
  sources: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  publishedSourceIds: ReadonlySet<string>;
  generatedAt: string;
}): TavernKeeperTargetManifest;

export function writeTavernKeeperTargets(
  manifest: TavernKeeperTargetManifest,
  outputPath?: string,
): Promise<void>;
