export type CatalogView = "all" | "active" | "new" | "released";
export type CatalogSort = "recent" | "strength" | "popularity" | "alphabetical";
export type CatalogDensity = "standard" | "compact";
export type CatalogKind = "frontend" | "extension" | "preset";
export type DevelopmentFilter = "active-month" | "new-release" | "dormant";
export type LicenseFilter = "open-source" | "proprietary" | "missing";

export interface CatalogQuery {
  search: string;
  category: string;
  view: CatalogView;
  sort: CatalogSort;
  density: CatalogDensity;
  frontends: string[];
  kinds: CatalogKind[];
  capabilities: string[];
  development: DevelopmentFilter[];
  licenses: LicenseFilter[];
}

export const DEFAULT_QUERY: CatalogQuery = {
  search: "",
  category: "",
  view: "all",
  sort: "recent",
  density: "standard",
  frontends: [],
  kinds: [],
  capabilities: [],
  development: [],
  licenses: [],
};

const validCategories = new Set([
  "frontend",
  "memory-retrieval",
  "generation-reasoning",
  "character-worldbuilding",
  "rpg-systems",
  "interface-workflow",
  "developer-infrastructure",
]);
const validFrontends = new Set([
  "sillytavern",
  "lumiverse",
  "marinara-engine",
  "sonder-engine",
]);
const validCapabilities = new Set([
  "automation",
  "character-worldbuilding",
  "extension-development",
  "image-generation",
  "instruction-control",
  "model-routing",
  "multi-frontend",
  "planning-reasoning",
  "prompt-engineering",
  "review-validation",
]);
const validViews = new Set<CatalogView>(["all", "active", "new", "released"]);
const validSorts = new Set<CatalogSort>([
  "recent",
  "strength",
  "popularity",
  "alphabetical",
]);
const validDensities = new Set<CatalogDensity>(["standard", "compact"]);
const validKinds = new Set<CatalogKind>(["frontend", "extension", "preset"]);
const validDevelopment = new Set<DevelopmentFilter>([
  "active-month",
  "new-release",
  "dormant",
]);
const validLicenses = new Set<LicenseFilter>([
  "open-source",
  "proprietary",
  "missing",
]);

function oneOf<T extends string>(
  value: string | null,
  valid: Set<T>,
  fallback: T,
) {
  return value !== null && valid.has(value as T) ? (value as T) : fallback;
}

function manyOf<T extends string>(values: string[], valid: Set<T>): T[] {
  return [
    ...new Set(values.filter((value) => valid.has(value as T)) as T[]),
  ].sort();
}

export function parseCatalogQuery(search: string): CatalogQuery {
  const parameters = new URLSearchParams(search);
  const category = parameters.get("category");
  return {
    search: parameters.get("q")?.trim() ?? "",
    category:
      category !== null && validCategories.has(category) ? category : "",
    view: oneOf(parameters.get("view"), validViews, DEFAULT_QUERY.view),
    sort: oneOf(parameters.get("sort"), validSorts, DEFAULT_QUERY.sort),
    density: oneOf(
      parameters.get("density"),
      validDensities,
      DEFAULT_QUERY.density,
    ),
    frontends: manyOf(parameters.getAll("frontend"), validFrontends),
    kinds: manyOf(parameters.getAll("kind"), validKinds),
    capabilities: manyOf(parameters.getAll("capability"), validCapabilities),
    development: manyOf(parameters.getAll("development"), validDevelopment),
    licenses: manyOf(parameters.getAll("license"), validLicenses),
  };
}

function appendMany(
  parameters: URLSearchParams,
  name: string,
  values: string[],
) {
  for (const value of [...new Set(values)].sort()) {
    parameters.append(name, value);
  }
}

export function serializeCatalogQuery(query: CatalogQuery): string {
  const parameters = new URLSearchParams();
  if (query.search.trim()) {
    parameters.set("q", query.search.trim());
  }
  if (query.category) {
    parameters.set("category", query.category);
  }
  if (query.view !== DEFAULT_QUERY.view) {
    parameters.set("view", query.view);
  }
  if (query.sort !== DEFAULT_QUERY.sort) {
    parameters.set("sort", query.sort);
  }
  if (query.density !== DEFAULT_QUERY.density) {
    parameters.set("density", query.density);
  }
  appendMany(parameters, "frontend", query.frontends);
  appendMany(parameters, "kind", query.kinds);
  appendMany(parameters, "capability", query.capabilities);
  appendMany(parameters, "development", query.development);
  appendMany(parameters, "license", query.licenses);
  return parameters.toString();
}
