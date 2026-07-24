"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_QUERY,
  type CatalogQuery,
} from "@/features/catalog/catalog-query";
import { selectProjects } from "@/features/catalog/catalog-selectors";
import { useCatalogQuery } from "@/features/catalog/use-catalog-query";
import type { Catalog } from "../catalog-types";
import { ActiveQuery } from "./active-query";
import { CatalogToolbar } from "./catalog-toolbar";
import { CategoryNavigation } from "./category-navigation";
import { FilterPanel, type FilterArray } from "./filter-panel";
import { ProjectGrid } from "./project-grid";
import { SiteHeader } from "./site-header";

function relativeRefresh(timestamp: string, now: string) {
  const minutes = Math.max(
    0,
    Math.floor(
      (new Date(now).getTime() - new Date(timestamp).getTime()) / 60_000,
    ),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function CatalogPage({ catalog }: { catalog: Catalog }) {
  const { query, setQuery } = useCatalogQuery();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const context = useMemo(() => ({ now: catalog.generatedAt }), [catalog]);
  const selected = useMemo(
    () => selectProjects(catalog.projects, query, context),
    [catalog.projects, context, query],
  );

  useEffect(() => {
    document.body.classList.toggle(
      "compact-cards",
      query.density === "compact",
    );
    return () => document.body.classList.remove("compact-cards");
  }, [query.density]);

  useEffect(() => {
    document.body.classList.toggle("sheet-open", filtersOpen);
    return () => document.body.classList.remove("sheet-open");
  }, [filtersOpen]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && filtersOpen) {
        setFiltersOpen(false);
        filterButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [filtersOpen]);

  const update = <Key extends keyof CatalogQuery>(
    key: Key,
    value: CatalogQuery[Key],
  ) => setQuery((current) => ({ ...current, [key]: value }));

  const toggleFilter = (group: FilterArray, value: string) => {
    setQuery((current) => {
      const values = current[group] as string[];
      return {
        ...current,
        [group]: values.includes(value)
          ? values.filter((item) => item !== value)
          : [...values, value],
      };
    });
  };

  const removeFilter = (key: keyof CatalogQuery, value?: string) => {
    setQuery((current) => {
      if (key === "search" || key === "category") {
        return { ...current, [key]: "" };
      }
      const values = current[key];
      if (Array.isArray(values) && value) {
        return {
          ...current,
          [key]: values.filter((item) => item !== value),
        };
      }
      return current;
    });
  };

  const clearFilters = () =>
    setQuery((current) => ({
      ...DEFAULT_QUERY,
      sort: current.sort,
      density: current.density,
    }));

  const filterCount =
    query.frontends.length +
    query.kinds.length +
    query.capabilities.length +
    query.development.length +
    query.licenses.length;
  const lastRefresh =
    catalog.projects
      .map(({ refreshedAt }) => refreshedAt)
      .filter((timestamp): timestamp is string => timestamp !== null)
      .sort()
      .at(-1) ?? catalog.generatedAt;

  const closeFilters = () => {
    setFiltersOpen(false);
    window.setTimeout(() => filterButtonRef.current?.focus(), 0);
  };

  return (
    <div className="catalog-shell">
      <SiteHeader
        search={query.search}
        onSearch={(value) => update("search", value)}
        searchRef={searchRef}
      />
      <CategoryNavigation
        selected={query.category}
        onSelect={(category) => update("category", category)}
      />
      <div className="catalog-layout">
        <FilterPanel
          query={query}
          projects={catalog.projects}
          onToggle={toggleFilter}
          onClear={clearFilters}
        />
        <main className="catalog-main">
          <CatalogToolbar
            count={selected.length}
            query={query}
            refreshedLabel={relativeRefresh(lastRefresh, catalog.generatedAt)}
            filterCount={filterCount}
            onView={(view) => update("view", view)}
            onSort={(sort) => update("sort", sort)}
            onDensity={() =>
              update(
                "density",
                query.density === "standard" ? "compact" : "standard",
              )
            }
            onOpenFilters={() => setFiltersOpen(true)}
            filterButtonRef={filterButtonRef}
          />
          <ActiveQuery
            query={query}
            projects={catalog.projects}
            onRemove={removeFilter}
            onClear={clearFilters}
          />
          <ProjectGrid projects={selected} now={catalog.generatedAt} />
        </main>
      </div>
      {filtersOpen ? (
        <FilterPanel
          mobile
          query={query}
          projects={catalog.projects}
          onToggle={toggleFilter}
          onClear={clearFilters}
          onClose={closeFilters}
        />
      ) : null}
    </div>
  );
}
