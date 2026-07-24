"use client";

import { useState } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import { isWithinDays, releaseTimestamp } from "@/features/catalog/activity";
import { licenseFilter } from "../catalog-license";
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
        return isWithinDays(project.activity.latestMeaningfulCommitAt, now, 30);
      return isWithinDays(releaseTimestamp(project), now, 30);
    }
    if (value === "open-source")
      return project.license.status === "osi-approved";
    if (value === "proprietary") return project.license.status === "proprietary";
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
  now: string;
}) {
  const normalizedSearch = search?.trim().toLocaleLowerCase() ?? "";
  const visibleOptions = normalizedSearch
    ? options.filter(({ label }) =>
        label.toLocaleLowerCase().includes(normalizedSearch),
      )
    : options;

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
        <div className="metadata-options">
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
              onChange={() => onToggle(group, option.id)}
            />
            <span>{option.label}</span>
            <b>{countFor(projects, group, option.id, now)}</b>
          </label>
        ))
      )}
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
}: {
  query: CatalogQuery;
  projects: CatalogProject[];
  onToggle: (group: FilterArray, value: string) => void;
  onClear: () => void;
  mobile?: boolean;
  onClose?: () => void;
  now: string;
}) {
  const [frontendSearch, setFrontendSearch] = useState("");
  const [capabilitySearch, setCapabilitySearch] = useState("");
  const content = (
    <>
      {mobile ? (
        <div className="filter-sheet-heading">
          <div>
            <small>Refine catalog</small>
            <h2>Filters</h2>
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
        options={uniqueLabels(projects, "frontends")}
        selected={query.frontends}
        projects={projects}
        onToggle={onToggle}
        search={frontendSearch}
        onSearch={setFrontendSearch}
        searchLabel="Search compatible frontends"
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
        search={capabilitySearch}
        onSearch={setCapabilitySearch}
        searchLabel="Search capabilities and characteristics"
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
    </>
  );

  if (mobile) {
    return (
      <div className="filter-overlay" onMouseDown={onClose}>
        <section
          className="filter-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
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
