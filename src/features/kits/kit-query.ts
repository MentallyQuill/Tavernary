export type KitSort = "trending" | "newest" | "updated" | "alphabetical";

export interface KitQuery {
  frontends: string[];
  purposes: string[];
  includesProjectId: string;
  minProjects: number;
  maxProjects: number;
  allComponentsAvailable: boolean;
  sort: KitSort;
}

export const DEFAULT_KIT_QUERY: KitQuery = {
  frontends: [],
  purposes: [],
  includesProjectId: "",
  minProjects: 3,
  maxProjects: 50,
  allComponentsAvailable: false,
  sort: "trending",
};

export const KIT_SORTS = new Set<KitSort>([
  "trending",
  "newest",
  "updated",
  "alphabetical",
]);
