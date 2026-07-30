"use client";

import { useRef, useState } from "react";
import { isWithinDays, releaseTimestamp } from "@/features/catalog/activity";
import { useModalSurface } from "@/hooks/use-modal-surface";
import frontendVocabulary from "../../../../data/vocabularies/frontends.json";
import modelFamilyVocabulary from "../../../../data/vocabularies/model-families.json";
import completionFormatVocabulary from "../../../../data/vocabularies/completion-formats.json";
import {
  matchesCompletionFormats,
  matchesModelFamilies,
} from "../preset-compatibility";
import { orderFrontendOptionsByPopularity } from "../frontend-option-order";
import type {
  CatalogKind,
  CatalogQuery,
  DevelopmentFilter,
  LicenseFilter,
} from "../catalog-query";
import type { CatalogProject } from "../catalog-types";
import type { PublicTagDefinition } from "../tag-vocabulary";
import {
  FilterGroup,
  FilterLegal,
  FilterPanelTitle,
  FilterSheetHeading,
  type FilterOption,
} from "./filter-controls";
import { TAG_FACET_PREVIEW_LIMIT, TagBrowser } from "./tag-browser";

type FilterArray =
  | "frontends"
  | "kinds"
  | "tags"
  | "modelFamilies"
  | "completionFormats"
  | "development"
  | "licenses";

const kindOptions: Array<{ id: CatalogKind; label: string }> = [
  { id: "frontend", label: "Frontend" },
  { id: "extension", label: "Extension" },
  { id: "preset", label: "System Preset" },
];
const developmentOptions: Array<{
  id: DevelopmentFilter;
  label: string;
}> = [
  { id: "active-month", label: "Active this month" },
  { id: "new-release", label: "Recently released" },
  { id: "dormant", label: "Dormant" },
];
const licenseOptions: Array<{ id: LicenseFilter; label: string }> = [
  { id: "open-source", label: "Open source" },
  { id: "proprietary", label: "Proprietary" },
  { id: "pending", label: "Pending verification" },
  { id: "missing", label: "Missing license" },
];
const frontendOptions = frontendVocabulary.frontends.map(({ id, label }) => ({
  id,
  label,
}));
const modelOptions = modelFamilyVocabulary.model_families.map(
  ({ id, label }) => ({ id, label }),
);
const completionOptions = completionFormatVocabulary.completion_formats.map(
  ({ id, label }) => ({ id, label }),
);
const modalBackground = [".site-header", ".mobile-category", ".catalog-layout"];

function uniqueLabels(projects: CatalogProject[], property: "frontends") {
  const values = new Map<string, string>();
  for (const project of projects) {
    for (const item of project[property]) {
      values.set(item.id, item.label);
    }
  }
  return [...values]
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function countFor(
  projects: CatalogProject[],
  group: FilterArray,
  value: string,
  now: string,
) {
  return projects.filter((project) => {
    if (group === "frontends" || group === "tags") {
      return project[group].some(({ id }) => id === value);
    }
    if (group === "modelFamilies") {
      return matchesModelFamilies(
        [value],
        project.preset?.modelFamilies?.map(({ id }) => id) ?? [],
      );
    }
    if (group === "completionFormats") {
      return matchesCompletionFormats(
        [value],
        project.preset?.completionFormats?.map(({ id }) => id) ?? [],
      );
    }
    if (group === "kinds") {
      return project.kind === value;
    }
    if (group === "development") {
      if (value === "dormant") return project.activity.dormant;
      if (value === "active-month")
        return isWithinDays(project.activity.latestSourceActivityAt, now, 30);
      return isWithinDays(releaseTimestamp(project), now, 30);
    }
    if (value === "open-source")
      return project.license.status === "osi-approved";
    if (value === "proprietary")
      return project.license.status === "proprietary";
    if (value === "pending") return project.license.status === "pending";
    return project.license.status === "missing";
  }).length;
}

function withCounts(
  options: Array<{ id: string; label: string }>,
  projects: CatalogProject[],
  group: FilterArray,
  now: string,
): FilterOption[] {
  return options.map((option) => ({
    ...option,
    count: countFor(projects, group, option.id, now),
  }));
}

export function FilterPanel({
  query,
  projects,
  tagVocabulary,
  onToggle,
  onClear,
  mobile = false,
  onClose,
  now,
  motionPhase = "entered",
}: {
  query: CatalogQuery;
  projects: CatalogProject[];
  tagVocabulary: PublicTagDefinition[];
  onToggle: (group: FilterArray, value: string) => void;
  onClear: () => void;
  mobile?: boolean;
  onClose?: () => void;
  now: string;
  motionPhase?: "entering" | "entered" | "exiting";
}) {
  const [frontendSearch, setFrontendSearch] = useState("");
  const sheetRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dismiss = onClose ?? (() => undefined);
  useModalSurface({
    active: mobile,
    containerRef: sheetRef,
    initialFocusRef: headingRef,
    onDismiss: dismiss,
    inertSelectors: modalBackground,
  });
  const content = (
    <>
      {mobile ? (
        <FilterSheetHeading
          headingRef={headingRef}
          headingId="project-filter-heading"
          closeLabel="Close filters"
          onClose={dismiss}
        />
      ) : (
        <FilterPanelTitle onClear={onClear} />
      )}
      <FilterGroup
        title="Compatible frontend"
        options={withCounts(
          orderFrontendOptionsByPopularity(frontendOptions, projects),
          projects,
          "frontends",
          now,
        )}
        selected={query.frontends}
        onToggle={(value) => onToggle("frontends", value)}
        search={frontendSearch}
        onSearch={setFrontendSearch}
        searchLabel="Search compatible frontends"
        initialVisibleCount={3}
      />
      <FilterGroup
        title="Project kind"
        options={withCounts(kindOptions, projects, "kinds", now)}
        selected={query.kinds}
        onToggle={(value) => onToggle("kinds", value)}
        kindColors
      />
      <section
        className="filter-tag-browser"
        aria-labelledby="project-tag-filter-heading"
      >
        <h3 id="project-tag-filter-heading">Goals &amp; traits</h3>
        <TagBrowser
          tags={tagVocabulary}
          selected={query.tags}
          onToggle={(value) => onToggle("tags", value)}
          previewLimit={TAG_FACET_PREVIEW_LIMIT}
          counts={Object.fromEntries(
            tagVocabulary.map(({ id }) => [
              id,
              countFor(projects, "tags", id, now),
            ]),
          )}
          searchLabel="Search goals and traits"
        />
      </section>
      <FilterGroup
        title="Model family"
        options={withCounts(modelOptions, projects, "modelFamilies", now)}
        selected={query.modelFamilies ?? []}
        onToggle={(value) => onToggle("modelFamilies", value)}
        presentation="chips"
      />
      <FilterGroup
        title="Completion format"
        options={withCounts(
          completionOptions,
          projects,
          "completionFormats",
          now,
        )}
        selected={query.completionFormats ?? []}
        onToggle={(value) => onToggle("completionFormats", value)}
        presentation="chips"
      />
      <FilterGroup
        title="Development"
        options={withCounts(developmentOptions, projects, "development", now)}
        selected={query.development}
        onToggle={(value) => onToggle("development", value)}
      />
      <FilterGroup
        title="License"
        options={withCounts(licenseOptions, projects, "licenses", now)}
        selected={query.licenses}
        onToggle={(value) => onToggle("licenses", value)}
      />
      <FilterLegal />
    </>
  );

  if (mobile) {
    return (
      <div
        className="filter-overlay"
        data-motion-phase={motionPhase}
        onMouseDown={dismiss}
      >
        <section
          ref={sheetRef}
          className="filter-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-filter-heading"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {content}
        </section>
      </div>
    );
  }

  return <aside className="filter-panel">{content}</aside>;
}

export type { FilterArray };
