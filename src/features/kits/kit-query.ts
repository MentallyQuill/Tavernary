export type KitSort = "trending" | "newest" | "updated" | "alphabetical";
export type KitProjectKind = "extension" | "preset";
export type KitDevelopmentFilter = "active-month" | "new-release" | "dormant";
export type KitLicenseFilter =
  "open-source" | "proprietary" | "missing" | "pending";

export interface KitQuery {
  frontends: string[];
  purposes: string[];
  includesProjectId: string;
  creatorIds: number[];
  kinds: KitProjectKind[];
  capabilities: string[];
  development: KitDevelopmentFilter[];
  licenses: KitLicenseFilter[];
  minProjects: number;
  maxProjects: number;
  tavernaryPickOnly: boolean;
  allComponentsAvailable: boolean;
  sort: KitSort;
}

export const DEFAULT_KIT_QUERY: KitQuery = {
  frontends: [],
  purposes: [],
  includesProjectId: "",
  creatorIds: [],
  kinds: [],
  capabilities: [],
  development: [],
  licenses: [],
  minProjects: 3,
  maxProjects: 50,
  tavernaryPickOnly: false,
  allComponentsAvailable: false,
  sort: "trending",
};

export const KIT_SORTS = new Set<KitSort>([
  "trending",
  "newest",
  "updated",
  "alphabetical",
]);
