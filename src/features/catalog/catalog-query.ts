export type CatalogView = "all" | "active" | "new" | "released";
export type CatalogSort =
  "recent" | "sustained" | "popularity" | "alphabetical";
export type CatalogDensity = "standard" | "compact";
export type CatalogKind = "frontend" | "extension" | "preset";
export type DevelopmentFilter = "active-month" | "new-release" | "dormant";
export type LicenseFilter =
  "open-source" | "proprietary" | "missing" | "pending";

export interface CatalogQuery {
  mode: CatalogMode;
  selectedKitId: string;
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
  kits: KitQuery;
}

export const DEFAULT_QUERY: CatalogQuery = {
  mode: "projects",
  selectedKitId: "",
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
  kits: DEFAULT_KIT_QUERY,
};

export const CATEGORY_OPTIONS = [
  { id: "", label: "All Projects", shortLabel: "All Projects" },
  { id: "frontend", label: "Frontends", shortLabel: "Frontends" },
  {
    id: "preset",
    label: "System Presets",
    shortLabel: "System Presets",
  },
  {
    id: "memory-retrieval",
    label: "Memory & Retrieval",
    shortLabel: "Memory & Retrieval",
  },
  {
    id: "generation-reasoning",
    label: "Generation & Reasoning",
    shortLabel: "Generation & Reasoning",
  },
  {
    id: "character-worldbuilding",
    label: "Character & Worldbuilding",
    shortLabel: "Character & Worldbuilding",
  },
  {
    id: "rpg-systems",
    label: "RPG Systems & Suites",
    shortLabel: "RPG Systems & Suites",
  },
  {
    id: "interface-workflow",
    label: "Interface & Workflow",
    shortLabel: "Interface & Workflow",
  },
  {
    id: "developer-infrastructure",
    label: "Developer Infrastructure",
    shortLabel: "Developer Infrastructure",
  },
  {
    id: "uncategorized",
    label: "Uncategorized",
    shortLabel: "Uncategorized",
  },
] as const;

const validCategories = new Set([
  "frontend",
  "preset",
  "memory-retrieval",
  "generation-reasoning",
  "character-worldbuilding",
  "rpg-systems",
  "interface-workflow",
  "developer-infrastructure",
  "uncategorized",
]);
const validPurposes = new Set([
  "memory-retrieval",
  "generation-reasoning",
  "character-worldbuilding",
  "rpg-systems",
  "interface-workflow",
  "developer-infrastructure",
  "uncategorized",
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
  "sustained",
  "popularity",
  "alphabetical",
]);
const validDensities = new Set<CatalogDensity>(["standard", "compact"]);
const validKinds = new Set<CatalogKind>(["frontend", "extension", "preset"]);
const validKitKinds = new Set<KitQuery["kinds"][number]>([
  "extension",
  "preset",
]);
const validDevelopment = new Set<DevelopmentFilter>([
  "active-month",
  "new-release",
  "dormant",
]);
const validLicenses = new Set<LicenseFilter>([
  "open-source",
  "proprietary",
  "missing",
  "pending",
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

function positiveIntegerIds(values: string[]): number[] {
  return [
    ...new Set(
      values
        .map(Number)
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ].sort((left, right) => left - right);
}

export function parseCatalogQuery(search: string): CatalogQuery {
  const parameters = new URLSearchParams(search);
  const category = parameters.get("category");
  const selectedKitId = parameters.get("kit")?.trim() ?? "";
  const mode =
    parameters.get("mode") === "kits" || selectedKitId ? "kits" : "projects";
  const parseRange = (name: string, fallback: number) => {
    const value = Number(parameters.get(name));
    return Number.isInteger(value) && value >= 3 && value <= 50
      ? value
      : fallback;
  };
  const minProjects = parseRange("minProjects", DEFAULT_KIT_QUERY.minProjects);
  const maxProjects = parseRange("maxProjects", DEFAULT_KIT_QUERY.maxProjects);
  const parsedKitQuery: KitQuery = {
    frontends: manyOf(parameters.getAll("frontend"), validFrontends),
    purposes: manyOf(parameters.getAll("purpose"), validPurposes),
    includesProjectId: parameters.get("includes")?.trim() ?? "",
    creatorIds: positiveIntegerIds(parameters.getAll("creator")),
    kinds: manyOf(parameters.getAll("kind"), validKitKinds),
    capabilities: manyOf(parameters.getAll("capability"), validCapabilities),
    development: manyOf(parameters.getAll("development"), validDevelopment),
    licenses: manyOf(parameters.getAll("license"), validLicenses),
    minProjects,
    maxProjects,
    tavernaryPickOnly: parameters.get("pick") === "1",
    allComponentsAvailable: parameters.get("available") === "1",
    sort: oneOf(
      parameters.get("sort"),
      KIT_SORTS,
      DEFAULT_KIT_QUERY.sort,
    ) as KitSort,
  };
  return {
    mode,
    selectedKitId,
    search: parameters.get("q")?.trim() ?? "",
    category:
      category !== null && validCategories.has(category) ? category : "",
    view: oneOf(parameters.get("view"), validViews, DEFAULT_QUERY.view),
    sort:
      mode === "projects"
        ? oneOf(parameters.get("sort"), validSorts, DEFAULT_QUERY.sort)
        : DEFAULT_QUERY.sort,
    density: oneOf(
      parameters.get("density"),
      validDensities,
      DEFAULT_QUERY.density,
    ),
    frontends:
      mode === "projects"
        ? manyOf(parameters.getAll("frontend"), validFrontends)
        : [],
    kinds:
      mode === "projects" ? manyOf(parameters.getAll("kind"), validKinds) : [],
    capabilities:
      mode === "projects"
        ? manyOf(parameters.getAll("capability"), validCapabilities)
        : [],
    development:
      mode === "projects"
        ? manyOf(parameters.getAll("development"), validDevelopment)
        : [],
    licenses:
      mode === "projects"
        ? manyOf(parameters.getAll("license"), validLicenses)
        : [],
    kits:
      mode === "kits" && minProjects <= maxProjects
        ? parsedKitQuery
        : { ...DEFAULT_KIT_QUERY },
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
  if (query.density !== DEFAULT_QUERY.density) {
    parameters.set("density", query.density);
  }
  if (query.mode === "kits") {
    parameters.set("mode", "kits");
    if (query.selectedKitId) {
      parameters.set("kit", query.selectedKitId);
    }
    appendMany(parameters, "frontend", query.kits.frontends);
    appendMany(parameters, "purpose", query.kits.purposes);
    if (query.kits.includesProjectId) {
      parameters.set("includes", query.kits.includesProjectId);
    }
    for (const creatorId of [...new Set(query.kits.creatorIds)].sort(
      (left, right) => left - right,
    )) {
      parameters.append("creator", String(creatorId));
    }
    appendMany(parameters, "kind", query.kits.kinds);
    appendMany(parameters, "capability", query.kits.capabilities);
    appendMany(parameters, "development", query.kits.development);
    appendMany(parameters, "license", query.kits.licenses);
    if (query.kits.minProjects !== DEFAULT_KIT_QUERY.minProjects) {
      parameters.set("minProjects", String(query.kits.minProjects));
    }
    if (query.kits.maxProjects !== DEFAULT_KIT_QUERY.maxProjects) {
      parameters.set("maxProjects", String(query.kits.maxProjects));
    }
    if (query.kits.tavernaryPickOnly) {
      parameters.set("pick", "1");
    }
    if (query.kits.allComponentsAvailable) {
      parameters.set("available", "1");
    }
    if (query.kits.sort !== DEFAULT_KIT_QUERY.sort) {
      parameters.set("sort", query.kits.sort);
    }
  } else {
    if (query.category) {
      parameters.set("category", query.category);
    }
    if (query.view !== DEFAULT_QUERY.view) {
      parameters.set("view", query.view);
    }
    if (query.sort !== DEFAULT_QUERY.sort) {
      parameters.set("sort", query.sort);
    }
    appendMany(parameters, "frontend", query.frontends);
    appendMany(parameters, "kind", query.kinds);
    appendMany(parameters, "capability", query.capabilities);
    appendMany(parameters, "development", query.development);
    appendMany(parameters, "license", query.licenses);
  }
  return parameters.toString();
}
import {
  DEFAULT_KIT_QUERY,
  KIT_SORTS,
  type KitQuery,
  type KitSort,
} from "@/features/kits/kit-query";

export type CatalogMode = "projects" | "kits";
