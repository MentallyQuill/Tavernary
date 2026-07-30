import { isWithinDays, releaseTimestamp } from "@/features/catalog/activity";
import type { CatalogQuery } from "./catalog-query";
import { licenseFilter } from "./catalog-license";
import type { CatalogProject } from "./catalog-types";
import { matchesSelectedTags } from "./catalog-tag-filter";
import type { PublicTagDefinition } from "./tag-vocabulary";
import {
  matchesCompletionFormats,
  matchesModelFamilies,
} from "./preset-compatibility";

const collator = new Intl.Collator("en", { sensitivity: "base" });

export function selectForkRelationship(
  projects: CatalogProject[],
  childProjectId: string,
): [parent: CatalogProject, child: CatalogProject] | null {
  const child = projects.find(({ id }) => id === childProjectId);
  const parentProjectId = child?.fork?.parentProjectId;
  if (
    !child ||
    child.fork?.status !== "published" ||
    !parentProjectId ||
    parentProjectId === child.id
  ) {
    return null;
  }

  const parent = projects.find(({ id }) => id === parentProjectId);
  return parent ? [parent, child] : null;
}

function matchesAny(selected: string[], values: string[]) {
  return (
    selected.length === 0 || selected.some((value) => values.includes(value))
  );
}

function matchesDevelopment(
  project: CatalogProject,
  selected: CatalogQuery["development"],
  now: string,
) {
  return (
    selected.length === 0 ||
    selected.some((filter) => {
      if (filter === "active-month") {
        return isWithinDays(project.activity.latestSourceActivityAt, now, 30);
      }
      if (filter === "new-release") {
        return isWithinDays(releaseTimestamp(project), now, 30);
      }
      return project.activity.dormant;
    })
  );
}

function matchesView(
  project: CatalogProject,
  view: CatalogQuery["view"],
  now: string,
) {
  if (view === "active") {
    return isWithinDays(project.activity.latestSourceActivityAt, now, 30);
  }
  if (view === "new") {
    return (
      project.catalogCohort === "standard" &&
      isWithinDays(project.catalogedAt, now, 30)
    );
  }
  if (view === "released") {
    return isWithinDays(releaseTimestamp(project), now, 30);
  }
  return true;
}

function fallbackOrder(left: CatalogProject, right: CatalogProject) {
  const dateOrder =
    new Date(right.catalogedAt).getTime() -
    new Date(left.catalogedAt).getTime();
  return (
    dateOrder ||
    collator.compare(left.name, right.name) ||
    collator.compare(left.id, right.id)
  );
}

function nullableDescending(
  left: number | null,
  right: number | null,
  leftProject: CatalogProject,
  rightProject: CatalogProject,
) {
  if (left === null && right === null) {
    return fallbackOrder(leftProject, rightProject);
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return (
    right - left ||
    collator.compare(leftProject.name, rightProject.name) ||
    collator.compare(leftProject.id, rightProject.id)
  );
}

function activityRecency(project: CatalogProject) {
  const sourceTime = project.activity.latestSourceActivityAt
    ? new Date(project.activity.latestSourceActivityAt).getTime()
    : Number.NEGATIVE_INFINITY;
  const releasedAt = releaseTimestamp(project);
  const releaseTime = releasedAt
    ? new Date(releasedAt).getTime()
    : Number.NEGATIVE_INFINITY;
  const recency = Math.max(sourceTime, releaseTime);
  return Number.isFinite(recency) ? recency : null;
}

function sortProjects(projects: CatalogProject[], sort: CatalogQuery["sort"]) {
  return projects.sort((left, right) => {
    if (sort === "alphabetical") {
      return (
        collator.compare(left.name, right.name) ||
        collator.compare(left.id, right.id)
      );
    }
    if (sort === "sustained") {
      const leftWeeks = left.activity.activeWeeks12;
      const rightWeeks = right.activity.activeWeeks12;
      if (leftWeeks === null && rightWeeks !== null) return 1;
      if (leftWeeks !== null && rightWeeks === null) return -1;
      if (
        leftWeeks !== null &&
        rightWeeks !== null &&
        leftWeeks !== rightWeeks
      ) {
        return rightWeeks - leftWeeks;
      }

      const leftRecency = activityRecency(left);
      const rightRecency = activityRecency(right);
      if (leftRecency === null && rightRecency !== null) return 1;
      if (leftRecency !== null && rightRecency === null) return -1;
      if (
        leftRecency !== null &&
        rightRecency !== null &&
        leftRecency !== rightRecency
      ) {
        return rightRecency - leftRecency;
      }
      return (
        collator.compare(left.name, right.name) ||
        collator.compare(left.id, right.id)
      );
    }
    if (sort === "popularity") {
      return nullableDescending(
        left.community?.aggregate ?? null,
        right.community?.aggregate ?? null,
        left,
        right,
      );
    }
    return nullableDescending(
      activityRecency(left),
      activityRecency(right),
      left,
      right,
    );
  });
}

export function selectProjects(
  projects: CatalogProject[],
  query: CatalogQuery,
  context: { now: string; tagVocabulary?: PublicTagDefinition[] },
): CatalogProject[] {
  const search = query.search.trim().toLowerCase();
  const tagVocabulary = context.tagVocabulary ?? [
    ...new Map(
      projects.flatMap(({ tags }) =>
        tags.map((tag) => [
          tag.id,
          { ...tag, aliases: [], applicable_kinds: [] },
        ]),
      ),
    ).values(),
  ];
  const selected = projects.filter(
    (project) =>
      (!search || project.searchableText.includes(search)) &&
      (!query.category ||
        (query.category === "frontend" || query.category === "preset"
          ? project.kind === query.category
          : project.primaryFunction === query.category)) &&
      matchesAny(
        query.frontends,
        project.frontends.map(({ id }) => id),
      ) &&
      matchesAny(query.kinds, [project.kind]) &&
      matchesSelectedTags(
        query.tags,
        project.tags.map(({ id }) => id),
        tagVocabulary,
      ) &&
      matchesModelFamilies(
        query.modelFamilies ?? [],
        project.preset?.modelFamilies?.map(({ id }) => id) ?? [],
      ) &&
      matchesCompletionFormats(
        query.completionFormats ?? [],
        project.preset?.completionFormats?.map(({ id }) => id) ?? [],
      ) &&
      matchesDevelopment(project, query.development, context.now) &&
      matchesAny(query.licenses, [licenseFilter(project)]) &&
      matchesView(project, query.view, context.now),
  );

  return sortProjects(selected, query.sort);
}
