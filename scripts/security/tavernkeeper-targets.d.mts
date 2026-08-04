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

export interface TavernKeeperTargetV3 extends TavernKeeperTargetV2 {
  catalog_priority: TavernKeeperTargetV2["catalog_priority"] & {
    popularity_rank: number;
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
    }
  | {
      schema_version: 3;
      generated_at: string;
      repositories: TavernKeeperTargetV3[];
    };

export function popularityRankedProjectIds(
  projects: Array<Record<string, unknown>>,
): string[];

export function popularityTopProjectIds(
  projects: Array<Record<string, unknown>>,
  limit?: number,
): Set<string>;

export function buildTavernKeeperTargets(options: {
  contractVersion: 1 | 2 | 3;
  sources: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  topProjectIds: ReadonlySet<string>;
  rankedProjectIds?: readonly string[];
  publishedSourceIds: ReadonlySet<string>;
  generatedAt: string;
}): TavernKeeperTargetManifest;

export function writeTavernKeeperTargets(
  manifest: TavernKeeperTargetManifest,
  outputPath?: string,
): Promise<void>;
