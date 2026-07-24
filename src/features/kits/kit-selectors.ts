import type { KitQuery, KitSort } from "@/features/kits/kit-query";
import type { CatalogKit } from "@/features/kits/kit-types";

const collator = new Intl.Collator("en", { sensitivity: "base" });

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

function kitComparator(sort: KitSort) {
  return (left: CatalogKit, right: CatalogKit) => {
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
): CatalogKit[] {
  const normalized = search.trim().toLowerCase();
  return kits
    .filter((kit) => !normalized || kit.searchableText.includes(normalized))
    .filter((kit) =>
      matchesAny(
        query.frontends,
        kit.frontends.map(({ id }) => id),
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
    .filter((kit) => !query.tavernaryPickOnly || kit.tavernaryPick)
    .sort(kitComparator(query.sort));
}
