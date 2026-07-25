"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import { isWithinDays, releaseTimestamp } from "@/features/catalog/activity";
import { useModalSurface } from "@/hooks/use-modal-surface";
import frontendVocabulary from "../../../../data/vocabularies/frontends.json";
import type {
  CatalogKind,
  CatalogQuery,
  DevelopmentFilter,
  LicenseFilter,
} from "../catalog-query";
import type { CatalogProject } from "../catalog-types";

type FilterArray =
  "frontends" | "kinds" | "capabilities" | "development" | "licenses";

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
const modalBackground = [".site-header", ".mobile-category", ".catalog-layout"];

function uniqueLabels(
  projects: CatalogProject[],
  property: "frontends" | "capabilities",
) {
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
    if (group === "frontends" || group === "capabilities") {
      return project[group].some(({ id }) => id === value);
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

function FilterGroup({
  title,
  group,
  options,
  selected,
  projects,
  onToggle,
  search,
  onSearch,
  searchLabel,
  presentation = "list",
  initialVisibleCount,
  now,
}: {
  title: string;
  group: FilterArray;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  projects: CatalogProject[];
  onToggle: (group: FilterArray, value: string) => void;
  search?: string;
  onSearch?: (value: string) => void;
  searchLabel?: string;
  presentation?: "list" | "chips";
  initialVisibleCount?: number;
  now: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [chipsOverflow, setChipsOverflow] = useState(false);
  const chipListRef = useRef<HTMLDivElement>(null);
  const normalizedSearch = search?.trim().toLocaleLowerCase() ?? "";
  const collapseLimit = initialVisibleCount ?? options.length;
  const pinned = options.slice(0, collapseLimit);
  const selectedExtras = options.filter(
    (option, index) => index >= collapseLimit && selected.includes(option.id),
  );
  const collapsedIds = new Set(
    [...pinned, ...selectedExtras].map(({ id }) => id),
  );
  const collapsedOptions = options.filter(({ id }) => collapsedIds.has(id));
  const searchedOptions = normalizedSearch
    ? options.filter(({ label }) =>
        label.toLocaleLowerCase().includes(normalizedSearch),
      )
    : options;
  const visibleOptions = normalizedSearch
    ? searchedOptions
    : expanded
      ? options
      : collapsedOptions;
  const hiddenCount = options.length - collapsedOptions.length;

  useLayoutEffect(() => {
    if (presentation !== "chips" || !chipListRef.current) return;
    const list = chipListRef.current;
    const measure = () => {
      const rowCount = new Set(
        Array.from(list.children).map((child) =>
          Math.round((child as HTMLElement).offsetTop),
        ),
      ).size;
      setChipsOverflow(rowCount > 4);
    };
    if (typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    measure();
    return () => observer.disconnect();
  }, [expanded, options, presentation, selected]);

  return (
    <fieldset className="filter-group">
      <legend>{title}</legend>
      {onSearch && searchLabel ? (
        <input
          className={
            presentation === "chips"
              ? "filter-search metadata-search"
              : "filter-search"
          }
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search…"
          aria-label={searchLabel}
        />
      ) : null}
      {presentation === "chips" ? (
        <div
          ref={chipListRef}
          className={`metadata-options${expanded ? "" : " collapsed"}`}
        >
          {visibleOptions.map((option) => {
            const isSelected = selected.includes(option.id);
            return (
              <label
                className={`metadata-option${isSelected ? " selected" : ""}`}
                key={option.id}
              >
                <span className="metadata-filter-chip">
                  <input
                    type="checkbox"
                    aria-label={option.label}
                    checked={isSelected}
                    onChange={() => onToggle(group, option.id)}
                  />
                  <span className="metadata-check" aria-hidden="true">
                    ✓
                  </span>
                  <span>{option.label}</span>
                  <b className="metadata-count">
                    {countFor(projects, group, option.id, now)}
                  </b>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        visibleOptions.map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              aria-label={option.label}
              checked={selected.includes(option.id)}
              className={group === "kinds" ? "kind-checkbox" : undefined}
              data-kind={group === "kinds" ? option.id : undefined}
              onChange={() => onToggle(group, option.id)}
            />
            <span>{option.label}</span>
            <b>{countFor(projects, group, option.id, now)}</b>
          </label>
        ))
      )}
      {presentation === "list" &&
      !normalizedSearch &&
      (hiddenCount > 0 || expanded) ? (
        <button
          className="more-frontends"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer" : `Show ${hiddenCount} more`}
        </button>
      ) : null}
      {presentation === "chips" && (chipsOverflow || expanded) ? (
        <button
          className="more-frontends metadata-disclosure"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer" : "Show more"}
        </button>
      ) : null}
    </fieldset>
  );
}

export function FilterPanel({
  query,
  projects,
  onToggle,
  onClear,
  mobile = false,
  onClose,
  now,
  motionPhase = "entered",
}: {
  query: CatalogQuery;
  projects: CatalogProject[];
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
        <div className="filter-sheet-heading">
          <div>
            <small>Refine catalog</small>
            <h2 ref={headingRef} id="project-filter-heading" tabIndex={-1}>
              Filters
            </h2>
          </div>
          <button type="button" aria-label="Close filters" onClick={onClose}>
            <CategoryIcon name="close" />
          </button>
        </div>
      ) : (
        <div className="filter-panel-title">
          <span>Filters</span>
          <button type="button" onClick={onClear}>
            Clear all
          </button>
        </div>
      )}
      <FilterGroup
        title="Compatible frontend"
        group="frontends"
        options={frontendOptions}
        selected={query.frontends}
        projects={projects}
        onToggle={onToggle}
        search={frontendSearch}
        onSearch={setFrontendSearch}
        searchLabel="Search compatible frontends"
        initialVisibleCount={3}
        now={now}
      />
      <FilterGroup
        title="Project kind"
        group="kinds"
        options={kindOptions}
        selected={query.kinds}
        projects={projects}
        onToggle={onToggle}
        now={now}
      />
      <FilterGroup
        title="Capabilities & characteristics"
        group="capabilities"
        options={uniqueLabels(projects, "capabilities")}
        selected={query.capabilities}
        projects={projects}
        onToggle={onToggle}
        presentation="chips"
        now={now}
      />
      <FilterGroup
        title="Development"
        group="development"
        options={developmentOptions}
        selected={query.development}
        projects={projects}
        onToggle={onToggle}
        now={now}
      />
      <FilterGroup
        title="License"
        group="licenses"
        options={licenseOptions}
        selected={query.licenses}
        projects={projects}
        onToggle={onToggle}
        now={now}
      />
      <div className="filter-legal">
        <span>Tavernary</span>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/MentallyQuill/Tavernary/blob/main/LICENSE">
          AGPL-3.0-only
        </a>
      </div>
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
