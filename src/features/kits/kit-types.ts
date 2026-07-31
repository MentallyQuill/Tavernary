import type {
  CatalogLabel,
  CatalogProject,
  ProjectKind,
} from "@/features/catalog/catalog-types";
import type { CatalogSearchFields } from "@/features/search/search-types";

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
  canonicalUrl: string | null;
  project: CatalogProject | null;
}

export interface CatalogKit {
  id: string;
  title: string;
  description: string;
  author: KitAuthor;
  sourceIssueNumber: number;
  sourceIssueUrl: string;
  publishedAt: string;
  updatedAt: string;
  frontends: CatalogLabel[];
  purposes: CatalogLabel[];
  modelFamilies: CatalogLabel[];
  components: CatalogKitComponent[];
  supporterCount: number | null;
  trendingScore: number | null;
  supportRefreshedAt: string | null;
  supportStale: boolean;
  flaggedProjectCount: number;
  search: CatalogSearchFields;
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
