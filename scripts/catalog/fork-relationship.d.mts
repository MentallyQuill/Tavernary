export interface ForkRelationshipRecord {
  id: string;
  name: string;
  visibility: string;
  source: {
    type: string;
    repository_id?: number | null;
  };
}

export interface CatalogForkRelationship {
  parentName: string;
  parentProjectId: string | null;
  parentUrl: string | null;
  status: "published" | "repository" | "not-listed" | "unavailable";
}

export interface ForkRelationshipSource {
  id: string;
  type: "github" | "codeberg";
  repository: string;
  repository_id: number;
}

export interface ForkRelationshipProject {
  id: string;
  name: string;
}

export interface ForkRelationshipSnapshot {
  provider?: "github" | "codeberg";
  source_health: string;
  repository: {
    id: number;
    fork?: boolean;
    parent?: {
      id: number;
      owner: string;
      name: string;
      url: string;
    } | null;
  };
}

export function resolveForkRelationship(input: {
  snapshot: ForkRelationshipSnapshot | null;
  recordsByRepositoryId?: Map<number | string, ForkRelationshipRecord>;
  publicProjectIds?: Set<string>;
  sourcesByRepositoryKey?: Map<string, ForkRelationshipSource>;
  publicProjectsBySourceId?: Map<string, ForkRelationshipProject[]>;
}): CatalogForkRelationship | null;
