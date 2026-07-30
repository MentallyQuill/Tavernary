import frontendVocabulary from "../../../data/vocabularies/frontends.json";
import { legacyCapabilityTagIds } from "./catalog-tag-filter";
import type { PublicTagDefinition } from "./tag-vocabulary";

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
  relationship: string;
  search: string;
  category: string;
  view: CatalogView;
  sort: CatalogSort;
  density: CatalogDensity;
  frontends: string[];
  kinds: CatalogKind[];
  tags: string[];
  modelFamilies?: string[];
  completionFormats?: string[];
  development: DevelopmentFilter[];
  licenses: LicenseFilter[];
  kits: KitQuery;
}

export const DEFAULT_QUERY: CatalogQuery = {
  mode: "projects",
  selectedKitId: "",
  relationship: "",
  search: "",
  category: "",
  view: "all",
  sort: "recent",
  density: "standard",
  frontends: [],
  kinds: [],
  tags: [],
  modelFamilies: [],
  completionFormats: [],
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
]);
const validPurposes = new Set([
  "memory-retrieval",
  "generation-reasoning",
  "character-worldbuilding",
  "rpg-systems",
  "interface-workflow",
  "developer-infrastructure",
]);
const validFrontends = new Set(
  frontendVocabulary.frontends.map(({ id }) => id),
);
const validModelFamilies = new Set([
  "model-agnostic",
  "claude",
  "gpt",
  "gemini",
  "gemma",
  "deepseek",
  "glm",
  "minimax",
  "mimo",
  "kimi",
  "qwen",
  "llama",
  "mistral",
]);
const validCompletionFormats = new Set(["chat-completion", "text-completion"]);
const validViews = new Set<CatalogView>(["all", "active", "new", "released"]);
const validSorts = new Set<CatalogSort>([
  "recent",
  "sustained",
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
  "pending",
]);
const projectIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function projectId(value: string | null) {
  const normalized = value?.trim() ?? "";
  return projectIdPattern.test(normalized) ? normalized : "";
}

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

export function parseCatalogQuery(
  search: string,
  tagVocabulary: PublicTagDefinition[] = [],
): CatalogQuery {
  const parameters = new URLSearchParams(search);
  const validTags = new Set(tagVocabulary.map(({ id }) => id));
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
    modelFamilies: manyOf(parameters.getAll("model"), validModelFamilies),
    includesProjectId: parameters.get("includes")?.trim() ?? "",
    minProjects,
    maxProjects,
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
    relationship:
      mode === "projects" ? projectId(parameters.get("relationship")) : "",
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
    tags:
      mode === "projects"
        ? manyOf(
            [
              ...parameters.getAll("tag"),
              ...legacyCapabilityTagIds(
                parameters.getAll("capability"),
                tagVocabulary,
              ),
            ],
            validTags,
          )
        : [],
    modelFamilies:
      mode === "projects"
        ? manyOf(parameters.getAll("model"), validModelFamilies)
        : [],
    completionFormats:
      mode === "projects"
        ? manyOf(parameters.getAll("completion"), validCompletionFormats)
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
    appendMany(parameters, "model", query.kits.modelFamilies ?? []);
    if (query.kits.includesProjectId) {
      parameters.set("includes", query.kits.includesProjectId);
    }
    if (query.kits.minProjects !== DEFAULT_KIT_QUERY.minProjects) {
      parameters.set("minProjects", String(query.kits.minProjects));
    }
    if (query.kits.maxProjects !== DEFAULT_KIT_QUERY.maxProjects) {
      parameters.set("maxProjects", String(query.kits.maxProjects));
    }
    if (query.kits.allComponentsAvailable) {
      parameters.set("available", "1");
    }
    if (query.kits.sort !== DEFAULT_KIT_QUERY.sort) {
      parameters.set("sort", query.kits.sort);
    }
  } else {
    const relationship = projectId(query.relationship);
    if (relationship) {
      parameters.set("relationship", relationship);
    }
    if (validCategories.has(query.category)) {
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
    appendMany(parameters, "tag", query.tags);
    appendMany(parameters, "model", query.modelFamilies ?? []);
    appendMany(parameters, "completion", query.completionFormats ?? []);
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
