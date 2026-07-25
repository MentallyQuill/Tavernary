import type { KitQuery, KitSort } from "@/features/kits/kit-query";
import type { CatalogKit } from "@/features/kits/kit-types";
import { isWithinDays, releaseTimestamp } from "@/features/catalog/activity";

const collator = new Intl.Collator("en", { sensitivity: "base" });

export type KitArrayFilter =
  | "frontends"
  | "purposes"
  | "creatorIds"
  | "kinds"
  | "capabilities"
  | "development"
  | "licenses";

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

function licenseFilter(status: string) {
  return status === "osi-approved" ? "open-source" : status;
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
  now = new Date().toISOString(),
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
        query.creatorIds.length === 0 ||
        query.creatorIds.includes(kit.author.githubUserId),
    )
    .filter((kit) =>
      matchesAny(
        query.kinds,
        kit.components.map(({ kind }) => kind),
      ),
    )
    .filter((kit) =>
      matchesAny(
        query.capabilities,
        kit.components.flatMap(
          ({ project }) => project?.capabilities.map(({ id }) => id) ?? [],
        ),
      ),
    )
    .filter(
      (kit) =>
        query.development.length === 0 ||
        kit.components.some(
          ({ project }) =>
            project !== null &&
            ((query.development.includes("active-month") &&
              isWithinDays(project.activity.latestSourceActivityAt, now, 30)) ||
              (query.development.includes("new-release") &&
                isWithinDays(releaseTimestamp(project), now, 30)) ||
              (query.development.includes("dormant") &&
                project.activity.dormant)),
        ),
    )
    .filter((kit) =>
      matchesAny(
        query.licenses,
        kit.components.flatMap(({ project }) =>
          project ? [licenseFilter(project.license.status)] : [],
        ),
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
    .filter(
      (kit) => !query.allComponentsAvailable || kit.flaggedProjectCount === 0,
    )
    .sort(kitComparator(query.sort));
}

export function countKitsForFilter(
  kits: CatalogKit[],
  query: KitQuery,
  group: KitArrayFilter,
  value: string | number,
  search = "",
  now = new Date().toISOString(),
) {
  const candidateQuery = {
    ...query,
    [group]: [value],
  } as KitQuery;
  return selectKits(kits, candidateQuery, search, now).length;
}
