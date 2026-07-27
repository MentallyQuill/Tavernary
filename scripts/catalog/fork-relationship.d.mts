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
  status: "published" | "not-listed" | "unavailable";
}

export interface ForkRelationshipSnapshot {
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
  recordsByRepositoryId: Map<number, ForkRelationshipRecord>;
  publicProjectIds: Set<string>;
}): CatalogForkRelationship | null;
