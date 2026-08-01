export type TavernKeeperProjectKind = "extension" | "frontend" | "preset";

export interface TavernKeeperTargetV1 {
  source_id: string;
  provider: "github";
  repository_id: number;
  repository: string;
  target_sha: string;
  canonical_url: string;
}

export interface TavernKeeperTargetV2 extends TavernKeeperTargetV1 {
  project_kinds: TavernKeeperProjectKind[];
  catalog_priority: {
    top_30: boolean;
    first_cataloged_at: string;
  };
}

export type TavernKeeperTargetManifest =
  | {
      schema_version: 1;
      generated_at: string;
      repositories: TavernKeeperTargetV1[];
    }
  | {
      schema_version: 2;
      generated_at: string;
      repositories: TavernKeeperTargetV2[];
    };

export function popularityTopProjectIds(
  projects: Array<Record<string, unknown>>,
  limit?: number,
): Set<string>;

export function buildTavernKeeperTargets(options: {
  contractVersion: 1 | 2;
  sources: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  topProjectIds: ReadonlySet<string>;
  publishedSourceIds: ReadonlySet<string>;
  generatedAt: string;
}): TavernKeeperTargetManifest;

export function writeTavernKeeperTargets(
  manifest: TavernKeeperTargetManifest,
  outputPath?: string,
): Promise<void>;
