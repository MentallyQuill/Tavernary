"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_QUERY,
  type CatalogQuery,
} from "@/features/catalog/catalog-query";
import { selectProjects } from "@/features/catalog/catalog-selectors";
import { useCatalogQuery } from "@/features/catalog/use-catalog-query";
import { KitFilterPanel } from "@/features/kits/components/kit-filter-panel";
import { KitGrid } from "@/features/kits/components/kit-grid";
import { DEFAULT_KIT_QUERY, type KitQuery } from "@/features/kits/kit-query";
import { selectKits } from "@/features/kits/kit-selectors";
import { addProject } from "@/features/kits/project-stack-order";
import { copyKitLink, kitShareUrl } from "@/features/kits/share-kit";
import {
  openKitSubmission,
  serializeKitManifest,
} from "@/features/kits/submission-transport";
import { KitWorkspace } from "@/features/kits/components/kit-workspace";
import { useKitWorkspace } from "@/features/kits/use-kit-workspace";
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
  const workspace = useKitWorkspace({
    selectedKitId: query.selectedKitId,
    onSelectKit: (selectedKitId) =>
      setQuery((current) => ({
        ...current,
        mode: "kits",
        selectedKitId,
      })),
  });
  const selectedProjects = useMemo(
    () => selectProjects(catalog.projects, query, context),
    [catalog.projects, context, query],
  );
  const selectedKits = useMemo(
    () => selectKits(catalog.kits, query.kits, query.search),
    [catalog.kits, query.kits, query.search],
  );
  const inspectedKitId =
    workspace.state.mode === "inspect" ? workspace.state.kitId : null;
  const buildState = workspace.state.mode === "build" ? workspace.state : null;

  useEffect(() => {
    document.body.classList.toggle(
      "compact-cards",
      query.mode === "projects" && query.density === "compact",
    );
    return () => document.body.classList.remove("compact-cards");
  }, [query.density, query.mode]);

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
  const updateKits = (kits: KitQuery) =>
    setQuery((current) => ({ ...current, kits }));

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

  const removeKitFilter = (key: keyof KitQuery, value?: string) => {
    setQuery((current) => {
      const kits = current.kits;
      if (key === "frontends" || key === "purposes") {
        return {
          ...current,
          kits: {
            ...kits,
            [key]: value ? kits[key].filter((item) => item !== value) : [],
          },
        };
      }
      if (key === "includesProjectId") {
        return { ...current, kits: { ...kits, includesProjectId: "" } };
      }
      if (key === "tavernaryPickOnly") {
        return { ...current, kits: { ...kits, tavernaryPickOnly: false } };
      }
      if (key === "minProjects" || key === "maxProjects") {
        return {
          ...current,
          kits: {
            ...kits,
            minProjects: DEFAULT_KIT_QUERY.minProjects,
            maxProjects: DEFAULT_KIT_QUERY.maxProjects,
          },
        };
      }
      return current;
    });
  };

  const clearFilters = () =>
    setQuery((current) =>
      current.mode === "kits"
        ? {
            ...current,
            search: "",
            selectedKitId: "",
            kits: { ...DEFAULT_KIT_QUERY, sort: current.kits.sort },
          }
        : {
            ...DEFAULT_QUERY,
            sort: current.sort,
            density: current.density,
          },
    );

  const filterCount =
    query.mode === "kits"
      ? query.kits.frontends.length +
        query.kits.purposes.length +
        Number(Boolean(query.kits.includesProjectId)) +
        Number(
          query.kits.minProjects !== DEFAULT_KIT_QUERY.minProjects ||
            query.kits.maxProjects !== DEFAULT_KIT_QUERY.maxProjects,
        ) +
        Number(query.kits.tavernaryPickOnly)
      : query.frontends.length +
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
  const selectProjectCategory = (category: string) =>
    setQuery((current) => ({
      ...current,
      mode: "projects",
      selectedKitId: "",
      category,
      kits: DEFAULT_KIT_QUERY,
    }));
  const selectKitMode = () =>
    setQuery((current) => ({
      ...DEFAULT_QUERY,
      mode: "kits",
      search: current.search,
      density: current.density,
      kits: current.kits,
    }));
  const reportKit = (kitId: string) => {
    const url = new URL(
      "https://github.com/MentallyQuill/Tavernary/issues/new",
    );
    url.searchParams.set("template", "06-kit-report.yml");
    url.searchParams.set("kit-id", kitId);
    url.searchParams.set("share-url", kitShareUrl(kitId));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="catalog-shell">
      <SiteHeader
        search={query.search}
        onSearch={(value) => update("search", value)}
        searchRef={searchRef}
      />
      <CategoryNavigation
        mode={query.mode}
        selected={query.category}
        onSelect={selectProjectCategory}
        onSelectKits={selectKitMode}
      />
      <div className="catalog-layout">
        {query.mode === "kits" ? (
          <KitFilterPanel
            query={query.kits}
            kits={catalog.kits}
            projects={catalog.projects}
            onChange={updateKits}
            onClear={clearFilters}
          />
        ) : (
          <FilterPanel
            query={query}
            projects={catalog.projects}
            now={catalog.generatedAt}
            onToggle={toggleFilter}
            onClear={clearFilters}
          />
        )}
        <main className="catalog-main">
          <CatalogToolbar
            count={
              query.mode === "kits"
                ? selectedKits.length
                : selectedProjects.length
            }
            query={query}
            refreshedLabel={relativeRefresh(lastRefresh, catalog.generatedAt)}
            filterCount={filterCount}
            onSort={(sort) => update("sort", sort)}
            onKitSort={(sort) => updateKits({ ...query.kits, sort })}
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
            kits={catalog.kits}
            onRemove={removeFilter}
            onRemoveKit={removeKitFilter}
            onClear={clearFilters}
          />
          {query.mode === "kits" ? (
            <KitGrid
              kits={selectedKits}
              now={catalog.generatedAt}
              selectedKitId={query.selectedKitId}
              onSelect={workspace.selectKit}
              onCopyLink={(kitId) => void copyKitLink(kitId)}
              onReport={reportKit}
            />
          ) : (
            <ProjectGrid
              projects={selectedProjects}
              now={catalog.generatedAt}
              draftProjectIds={buildState?.draft.projectIds}
              onAddToKit={
                buildState
                  ? (projectId) =>
                      workspace.updateDraft({
                        projectIds: addProject(
                          buildState.draft.projectIds,
                          projectId,
                        ),
                      })
                  : undefined
              }
            />
          )}
        </main>
        <KitWorkspace
          state={workspace.state}
          kit={
            inspectedKitId
              ? (catalog.kits.find(({ id }) => id === inspectedKitId) ?? null)
              : null
          }
          onCollapse={workspace.toggleCollapsed}
          onDuplicate={workspace.startDuplicate}
          onEdit={workspace.startEdit}
          projects={catalog.projects}
          originalProjectIds={
            workspace.draftOrigin === "duplicate"
              ? workspace.originalProjectIds
              : []
          }
          onStartCreate={workspace.startCreate}
          onUpdateDraft={workspace.updateDraft}
          onSubmitDraft={
            buildState
              ? () =>
                  void openKitSubmission(
                    "https://github.com/MentallyQuill/Tavernary/issues/new?template=05-kit-submission.yml",
                    serializeKitManifest(buildState.draft),
                  )
              : undefined
          }
          active={query.mode === "kits" || workspace.state.mode !== "intro"}
        />
      </div>
      {filtersOpen ? (
        query.mode === "kits" ? (
          <KitFilterPanel
            mobile
            query={query.kits}
            kits={catalog.kits}
            projects={catalog.projects}
            onChange={updateKits}
            onClear={clearFilters}
            onClose={closeFilters}
          />
        ) : (
          <FilterPanel
            mobile
            query={query}
            projects={catalog.projects}
            now={catalog.generatedAt}
            onToggle={toggleFilter}
            onClear={clearFilters}
            onClose={closeFilters}
          />
        )
      ) : null}
    </div>
  );
}
