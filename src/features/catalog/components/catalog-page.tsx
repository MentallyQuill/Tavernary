"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  DEFAULT_QUERY,
  type CatalogQuery,
} from "@/features/catalog/catalog-query";
import {
  selectForkRelationship,
  selectProjects,
} from "@/features/catalog/catalog-selectors";
import { useCatalogQuery } from "@/features/catalog/use-catalog-query";
import { KitFilterPanel } from "@/features/kits/components/kit-filter-panel";
import { KitGrid } from "@/features/kits/components/kit-grid";
import { ProjectSelectionDock } from "@/features/kits/components/project-selection-dock";
import { DEFAULT_KIT_QUERY, type KitQuery } from "@/features/kits/kit-query";
import { selectKits } from "@/features/kits/kit-selectors";
import { openKitSubmission } from "@/features/kits/submission-transport";
import { createCatalogSearchIndex } from "@/features/search/catalog-search";
import { KitBuilderPanel } from "@/features/kits/components/kit-builder-panel";
import { KitShareNotice } from "@/features/kits/components/kit-share-notice";
import { useKitBuilder } from "@/features/kits/use-kit-builder";
import { useKitShareFeedback } from "@/features/kits/use-kit-share-feedback";
import { useProjectBatchSelection } from "@/features/kits/use-project-batch-selection";
import { useResponsiveCapabilities } from "@/hooks/use-responsive-capabilities";
import { useTransitionPresence } from "@/hooks/use-transition-presence";
import type { Catalog } from "../catalog-types";
import { ActiveQuery } from "./active-query";
import { CatalogToolbar } from "./catalog-toolbar";
import { CategoryNavigation } from "./category-navigation";
import { FilterPanel, type FilterArray } from "./filter-panel";
import { projectDisplayName } from "./project-card";
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

function projectCountLabel(count: number) {
  return `${count} ${count === 1 ? "project" : "projects"}`;
}

type AddedStatus = {
  addedCount: number;
  draftCount: number;
};

export function CatalogPage({ catalog }: { catalog: Catalog }) {
  const router = useRouter();
  const { query, setQuery, pushQuery, removeRelationship } = useCatalogQuery(
    catalog.tagVocabulary,
  );
  const [searchDraft, setSearchDraft] = useState(() => ({
    value: query.search,
    canonical: query.search,
  }));
  if (searchDraft.canonical !== query.search) {
    setSearchDraft({ value: query.search, canonical: query.search });
  }
  const searchInput = searchDraft.value;
  const kitShare = useKitShareFeedback();
  const { phone } = useResponsiveCapabilities();
  const [openFilterMode, setOpenFilterMode] = useState<
    CatalogQuery["mode"] | null
  >(null);
  const filtersOpen = openFilterMode === query.mode;
  const filterPresence = useTransitionPresence(filtersOpen, 220);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const addedStatusTimerRef = useRef<number | null>(null);
  const [addedStatus, setAddedStatus] = useState<AddedStatus | null>(null);
  const [selectionAnnouncement, setSelectionAnnouncement] = useState("");
  const context = useMemo(
    () => ({
      now: catalog.generatedAt,
      tagVocabulary: catalog.tagVocabulary,
    }),
    [catalog.generatedAt, catalog.tagVocabulary],
  );
  const projectSearchIndex = useMemo(
    () =>
      createCatalogSearchIndex(
        catalog.projects.map(({ id, search }) => ({ id, ...search })),
      ),
    [catalog.projects],
  );
  const projectSearchResults = useMemo(
    () => projectSearchIndex.search(searchInput),
    [projectSearchIndex, searchInput],
  );
  const workspace = useKitBuilder({
    selectedKitId: query.selectedKitId,
    projects: catalog.projects,
    onSelectKit: (selectedKitId) =>
      setQuery((current) => ({
        ...current,
        mode: "kits",
        selectedKitId,
      })),
  });
  const selectedProjects = useMemo(
    () =>
      selectProjects(
        catalog.projects,
        { ...query, search: searchInput },
        context,
        projectSearchResults,
      ),
    [catalog.projects, context, projectSearchResults, query, searchInput],
  );
  const relationshipProjects = useMemo(
    () =>
      query.relationship
        ? selectForkRelationship(catalog.projects, query.relationship)
        : null,
    [catalog.projects, query.relationship],
  );
  const relationship =
    relationshipProjects === null
      ? null
      : {
          childId: relationshipProjects[1].id,
          childName: projectDisplayName(relationshipProjects[1].name),
          parentName: projectDisplayName(relationshipProjects[0].name),
        };
  const visibleProjects = relationshipProjects ?? selectedProjects;
  const selectedKits = useMemo(
    () => selectKits(catalog.kits, query.kits, searchInput),
    [catalog.kits, query.kits, searchInput],
  );
  const inspectedKitId =
    workspace.state.mode === "inspect" ? workspace.state.kitId : null;
  const buildState = workspace.state.mode === "build" ? workspace.state : null;
  const batchSelection = useProjectBatchSelection({
    projects: catalog.projects,
    draftProjectIds: buildState?.draft.projectIds ?? [],
    active: query.mode === "projects",
    onFirstSelection: () =>
      workspace.startSelectionDraft({
        collapsed: phone && workspace.state.mode === "intro" ? true : undefined,
      }),
    onSelectionEmpty: workspace.discardUntouchedSelectionDraft,
    onRemoveFromDraft: workspace.removeProjectFromDraft,
    onStatus: setSelectionAnnouncement,
    onApply: (projectIds) =>
      workspace.applyProjectBatch(projectIds, catalog.projects),
  });
  const draftAccessStatus = buildState
    ? addedStatus
      ? {
          phase: "added" as const,
          ...addedStatus,
        }
      : {
          phase: "settled" as const,
          draftCount: buildState.draft.projectIds.length,
        }
    : undefined;
  const addSelectedProjects = () => {
    const replacedFrontend = batchSelection.replacementFrontendName;
    const selectedFrontend = batchSelection.selectedFrontendName;
    const plan = batchSelection.apply();
    if (!plan || plan.addedProjectIds.length === 0) return;

    if (addedStatusTimerRef.current !== null) {
      window.clearTimeout(addedStatusTimerRef.current);
    }
    setAddedStatus({
      addedCount: plan.addedProjectIds.length,
      draftCount: plan.projectIds.length,
    });
    setSelectionAnnouncement(
      replacedFrontend && selectedFrontend
        ? `${selectedFrontend} replaced ${replacedFrontend}. ${projectCountLabel(
            plan.projectIds.length,
          )} in draft.`
        : `${projectCountLabel(plan.addedProjectIds.length)} added. ${projectCountLabel(
            plan.projectIds.length,
          )} in draft.`,
    );
    addedStatusTimerRef.current = window.setTimeout(() => {
      setAddedStatus(null);
      addedStatusTimerRef.current = null;
    }, 1600);
  };
  useEffect(() => {
    document.body.classList.toggle(
      "compact-cards",
      query.mode === "projects" && query.density === "compact",
    );
    return () => document.body.classList.remove("compact-cards");
  }, [query.density, query.mode]);

  useEffect(() => {
    if (query.relationship && !relationshipProjects) {
      removeRelationship();
    }
  }, [query.relationship, relationshipProjects, removeRelationship]);

  useEffect(
    () => () => {
      if (addedStatusTimerRef.current !== null) {
        window.clearTimeout(addedStatusTimerRef.current);
      }
    },
    [],
  );

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
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const update = <Key extends keyof CatalogQuery>(
    key: Key,
    value: CatalogQuery[Key],
  ) => setQuery((current) => ({ ...current, [key]: value }));
  const updateSearch = (value: string) => {
    setSearchDraft({ value, canonical: value.trim() });
    update("search", value);
  };
  const updateKits = (kits: KitQuery) =>
    setQuery((current) => ({ ...current, kits }));
  const revealFrontendCards = () =>
    setQuery((current) => {
      if (current.mode === "projects" && current.kinds.includes("frontend")) {
        return current;
      }
      return {
        ...current,
        mode: "projects",
        selectedKitId: "",
        kinds: current.kinds.includes("frontend")
          ? current.kinds
          : [...current.kinds, "frontend"],
      };
    });

  const toggleFilter = (group: FilterArray, value: string) => {
    setQuery((current) => {
      const values = (current[group] ?? []) as string[];
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
      if (
        key === "frontends" ||
        key === "purposes" ||
        key === "modelFamilies"
      ) {
        const values = kits[key] ?? [];
        return {
          ...current,
          kits: {
            ...kits,
            [key]: value ? values.filter((item) => item !== value) : [],
          },
        };
      }
      if (key === "includesProjectId") {
        return { ...current, kits: { ...kits, includesProjectId: "" } };
      }
      if (key === "allComponentsAvailable") {
        return {
          ...current,
          kits: { ...kits, allComponentsAvailable: false },
        };
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
        (query.kits.modelFamilies?.length ?? 0) +
        Number(Boolean(query.kits.includesProjectId)) +
        Number(
          query.kits.minProjects !== DEFAULT_KIT_QUERY.minProjects ||
            query.kits.maxProjects !== DEFAULT_KIT_QUERY.maxProjects,
        ) +
        Number(query.kits.allComponentsAvailable)
      : query.frontends.length +
        query.kinds.length +
        query.tags.length +
        (query.modelFamilies?.length ?? 0) +
        (query.completionFormats?.length ?? 0) +
        query.development.length +
        query.licenses.length +
        Number(Boolean(relationshipProjects));
  const lastRefresh =
    catalog.projects
      .map(({ refreshedAt }) => refreshedAt)
      .filter((timestamp): timestamp is string => timestamp !== null)
      .sort()
      .at(-1) ?? catalog.generatedAt;

  const closeFilters = () => {
    setOpenFilterMode(null);
    const delay = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : 220;
    window.setTimeout(() => filterButtonRef.current?.focus(), delay);
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
    router.push(`/help/report-kit/?kit=${encodeURIComponent(kitId)}`);
  };

  return (
    <div className="catalog-shell">
      <SiteHeader
        search={searchInput}
        onSearch={updateSearch}
        searchRef={searchRef}
      />
      <CategoryNavigation
        mode={query.mode}
        selected={query.category}
        onSelect={selectProjectCategory}
        onSelectKits={selectKitMode}
      />
      <div
        className="catalog-layout"
        data-kit-builder-collapsed={workspace.state.collapsed}
      >
        {query.mode === "kits" ? (
          <KitFilterPanel
            query={query.kits}
            kits={catalog.kits}
            projects={catalog.projects}
            search={searchInput}
            onChange={updateKits}
            onClear={clearFilters}
          />
        ) : (
          <FilterPanel
            query={query}
            projects={catalog.projects}
            tagVocabulary={catalog.tagVocabulary}
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
                : visibleProjects.length
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
            onOpenFilters={() => setOpenFilterMode(query.mode)}
            onCreateKit={workspace.startCreate}
            filterButtonRef={filterButtonRef}
          />
          <ActiveQuery
            query={query}
            projects={catalog.projects}
            kits={catalog.kits}
            relationship={relationship}
            onRemove={removeFilter}
            onRemoveKit={removeKitFilter}
            onRemoveRelationship={removeRelationship}
            onClear={clearFilters}
          />
          {query.mode === "kits" ? (
            <KitGrid
              kits={selectedKits}
              now={catalog.generatedAt}
              selectedKitId={query.selectedKitId}
              onSelect={workspace.selectKit}
              onCopyLink={kitShare.copy}
              onReport={reportKit}
            />
          ) : (
            <ProjectGrid
              projects={visibleProjects}
              now={catalog.generatedAt}
              relationshipChildId={
                relationshipProjects ? query.relationship : ""
              }
              onViewRelationship={(childProjectId) =>
                pushQuery((current) => ({
                  ...current,
                  relationship: childProjectId,
                }))
              }
              selection={{
                bindingsFor: batchSelection.bindingsFor,
              }}
            />
          )}
          {batchSelection.selectionMode ? (
            <div className="project-selection-spacer" aria-hidden="true" />
          ) : null}
        </main>
        <KitBuilderPanel
          state={workspace.state}
          kit={
            inspectedKitId
              ? (catalog.kits.find(({ id }) => id === inspectedKitId) ?? null)
              : null
          }
          now={catalog.generatedAt}
          onCopyLink={kitShare.copy}
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
          onRevealFrontends={revealFrontendCards}
          onUpdateDraft={workspace.updateDraft}
          onDiscardDraft={workspace.discardDraft}
          omittedProjectCount={workspace.omittedProjectCount}
          onSubmitDraft={
            buildState
              ? () =>
                  openKitSubmission(
                    "https://github.com/MentallyQuill/Tavernary/issues/new",
                    buildState.draft,
                  )
              : undefined
          }
          active={query.mode === "kits" || workspace.state.mode !== "intro"}
          draftAccessStatus={draftAccessStatus}
          hidePhoneDraftAccess={batchSelection.selectionMode}
        />
      </div>
      {batchSelection.selectionMode ? (
        <ProjectSelectionDock
          selectedCount={batchSelection.selectedCount}
          replacementFrontendName={batchSelection.replacementFrontendName}
          limitReached={batchSelection.limitReached}
          nothingCanBeAdded={batchSelection.nothingCanBeAdded}
          onCancel={batchSelection.clear}
          onAdd={addSelectedProjects}
        />
      ) : null}
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {selectionAnnouncement}
      </p>
      <KitShareNotice feedback={kitShare.feedback} />
      {filterPresence.present ? (
        (openFilterMode ?? query.mode) === "kits" ? (
          <KitFilterPanel
            mobile
            motionPhase={filterPresence.phase}
            query={query.kits}
            kits={catalog.kits}
            projects={catalog.projects}
            search={searchInput}
            onChange={updateKits}
            onClear={clearFilters}
            onClose={closeFilters}
          />
        ) : (
          <FilterPanel
            mobile
            motionPhase={filterPresence.phase}
            query={query}
            projects={catalog.projects}
            tagVocabulary={catalog.tagVocabulary}
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
