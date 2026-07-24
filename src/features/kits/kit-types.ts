import type {
  CatalogLabel,
  CatalogProject,
  ProjectKind,
} from "@/features/catalog/catalog-types";

export interface KitAuthor {
  githubUserId: number;
  login: string;
}

export interface CatalogKitComponent {
  projectId: string;
  name: string;
  kind: ProjectKind;
  primaryFunction: string;
  availability: "available" | "flagged";
  unavailableReason: string | null;
  project: CatalogProject | null;
}

export interface CatalogKit {
  id: string;
  title: string;
  description: string;
  author: KitAuthor;
  sourceIssueNumber: number;
  publishedAt: string;
  updatedAt: string;
  tavernaryPick: boolean;
  frontends: CatalogLabel[];
  purposes: CatalogLabel[];
  components: CatalogKitComponent[];
  supporterCount: number | null;
  trendingScore: number | null;
  supportRefreshedAt: string | null;
  supportStale: boolean;
  flaggedProjectCount: number;
  searchableText: string;
}

export interface KitDraft {
  operation: "create" | "edit";
  kitId: string | null;
  title: string;
  description: string;
  projectIds: string[];
}

export interface KitSupporter {
  githubUserId: number;
  login: string;
  firstReactedAt: string;
  active: boolean;
}

export interface KitSupportSnapshot {
  schemaVersion: 1;
  kitId: string;
  sourceIssueNumber: number;
  refreshedAt: string;
  staleSince: string | null;
  supporters: KitSupporter[];
}
