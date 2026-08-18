export type KitBrowseSort = "trending" | "newest" | "updated" | "alphabetical";
export type KitSort = KitBrowseSort | "relevance";

export const DEFAULT_KIT_BROWSE_SORT: KitBrowseSort = "trending";

export interface KitQuery {
  frontends: string[];
  purposes: string[];
  modelFamilies?: string[];
  includesProjectId: string;
  minProjects: number;
  maxProjects: number;
  allComponentsAvailable: boolean;
  sort: KitSort;
}

export const DEFAULT_KIT_QUERY: KitQuery = {
  frontends: [],
  purposes: [],
  modelFamilies: [],
  includesProjectId: "",
  minProjects: 3,
  maxProjects: 50,
  allComponentsAvailable: false,
  sort: DEFAULT_KIT_BROWSE_SORT,
};

export const KIT_BROWSE_SORTS = new Set<KitBrowseSort>([
  "trending",
  "newest",
  "updated",
  "alphabetical",
]);
export const KIT_SORTS = new Set<KitSort>([...KIT_BROWSE_SORTS, "relevance"]);
