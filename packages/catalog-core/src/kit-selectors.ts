import type { KitQuery, KitSort } from "./kit-query";
import type { CatalogKit } from "./kit-types";
import { matchesModelFamilies } from "./preset-compatibility";
import { exactAllTermSearch } from "./project-search";
import { searchMeaning } from "./search-normalization";
import type { CatalogSearchResults } from "./search-types";

const collator = new Intl.Collator("en", { sensitivity: "base" });

export type KitArrayFilter = "frontends" | "purposes" | "modelFamilies";

function matchesAny(selected: string[], values: string[]) {
  return (
    selected.length === 0 || selected.some((value) => values.includes(value))
  );
}

function compareTitleAndId(left: CatalogKit, right: CatalogKit) {
  return (
    collator.compare(left.title, right.title) ||
    collator.compare(left.id, right.id)
  );
}

function comparePublished(left: CatalogKit, right: CatalogKit) {
  return (
    Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
    compareTitleAndId(left, right)
  );
}

function kitComparator(sort: KitSort, searchResults?: CatalogSearchResults) {
  const scores = new Map(
    searchResults?.matches.map(({ id, score }) => [id, score]) ?? [],
  );
  return (left: CatalogKit, right: CatalogKit) => {
    if (sort === "relevance") {
      return (
        (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0) ||
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        compareTitleAndId(left, right)
      );
    }
    if (sort === "alphabetical") {
      return compareTitleAndId(left, right);
    }
    if (sort === "newest") {
      return comparePublished(left, right);
    }
    if (sort === "updated") {
      return (
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        compareTitleAndId(left, right)
      );
    }
    if (left.trendingScore === null && right.trendingScore === null) {
      return comparePublished(left, right);
    }
    if (left.trendingScore === null) {
      return 1;
    }
    if (right.trendingScore === null) {
      return -1;
    }
    return (
      right.trendingScore - left.trendingScore || comparePublished(left, right)
    );
  };
}

export function selectKits(
  kits: CatalogKit[],
  query: KitQuery,
  search = "",
  searchResults?: CatalogSearchResults,
): CatalogKit[] {
  const normalized = searchMeaning(search);
  const effectiveSearchResults =
    searchResults?.normalizedQuery === normalized
      ? searchResults
      : exactAllTermSearch(
          kits.map(({ id, search: fields }) => ({ id, ...fields })),
          search,
        );
  const matchingKitIds = new Set(
    effectiveSearchResults.matches.map(({ id }) => id),
  );
  return kits
    .filter((kit) => !normalized || matchingKitIds.has(kit.id))
    .filter((kit) =>
      matchesAny(
        query.frontends,
        kit.frontends.map(({ id }) => id),
      ),
    )
    .filter((kit) =>
      matchesModelFamilies(
        query.modelFamilies ?? [],
        kit.modelFamilies?.map(({ id }) => id) ?? [],
      ),
    )
    .filter((kit) =>
      matchesAny(
        query.purposes,
        kit.purposes.map(({ id }) => id),
      ),
    )
    .filter(
      (kit) =>
        !query.includesProjectId ||
        kit.components.some(
          ({ projectId }) => projectId === query.includesProjectId,
        ),
    )
    .filter(
      (kit) =>
        kit.components.length >= query.minProjects &&
        kit.components.length <= query.maxProjects,
    )
    .filter(
      (kit) => !query.allComponentsAvailable || kit.flaggedProjectCount === 0,
    )
    .sort(kitComparator(query.sort, effectiveSearchResults));
}

export function countKitsForFilter(
  kits: CatalogKit[],
  query: KitQuery,
  group: KitArrayFilter,
  value: string,
  search = "",
) {
  const candidateQuery = {
    ...query,
    [group]: [value],
  } as KitQuery;
  return selectKits(kits, candidateQuery, search).length;
}
