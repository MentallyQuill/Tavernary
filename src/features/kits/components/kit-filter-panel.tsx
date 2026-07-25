"use client";

import { useRef, useState } from "react";

import { DualRange } from "@/components/ui/dual-range";
import {
  FilterGroup,
  FilterLegal,
  FilterPanelTitle,
  FilterSheetHeading,
  type FilterOption,
} from "@/features/catalog/components/filter-controls";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { KitArrayFilter } from "@/features/kits/kit-selectors";
import { countKitsForFilter, selectKits } from "@/features/kits/kit-selectors";
import type { KitQuery } from "@/features/kits/kit-query";
import type { CatalogKit } from "@/features/kits/kit-types";
import { useModalSurface } from "@/hooks/use-modal-surface";

const modalBackground = [".site-header", ".mobile-category", ".catalog-layout"];
const kindOptions = [
  { id: "extension", label: "Extension" },
  { id: "preset", label: "System Preset" },
];
const developmentOptions = [
  { id: "active-month", label: "Active this month" },
  { id: "new-release", label: "Recently released" },
  { id: "dormant", label: "Dormant" },
];
const licenseOptions = [
  { id: "open-source", label: "Open source" },
  { id: "proprietary", label: "Proprietary" },
  { id: "pending", label: "Pending verification" },
  { id: "missing", label: "Missing license" },
];

function labels(kits: CatalogKit[], property: "frontends" | "purposes") {
  const values = new Map<string, string>();
  for (const kit of kits) {
    for (const item of kit[property]) values.set(item.id, item.label);
  }
  return [...values]
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function componentCapabilities(kits: CatalogKit[]) {
  const values = new Map<string, string>();
  for (const kit of kits) {
    for (const component of kit.components) {
      for (const capability of component.project?.capabilities ?? []) {
        values.set(capability.id, capability.label);
      }
    }
  }
  return [...values]
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function creators(kits: CatalogKit[]) {
  const values = new Map<number, string>();
  for (const kit of kits) {
    values.set(kit.author.githubUserId, kit.author.login);
  }
  return [...values]
    .map(([id, label]) => ({ id: String(id), label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function countedOptions(
  options: Array<{ id: string; label: string }>,
  kits: CatalogKit[],
  query: KitQuery,
  group: Exclude<KitArrayFilter, "creatorIds">,
  search: string,
  now: string,
): FilterOption[] {
  return options.map((option) => ({
    ...option,
    count: countKitsForFilter(kits, query, group, option.id, search, now),
  }));
}

function countedCreators(
  kits: CatalogKit[],
  query: KitQuery,
  search: string,
  now: string,
): FilterOption[] {
  return creators(kits).map((option) => ({
    ...option,
    count: countKitsForFilter(
      kits,
      query,
      "creatorIds",
      Number(option.id),
      search,
      now,
    ),
  }));
}

export function KitFilterPanel({
  query,
  kits,
  projects,
  onChange,
  onClear,
  search = "",
  now,
  mobile = false,
  onClose,
  motionPhase = "entered",
}: {
  query: KitQuery;
  kits: CatalogKit[];
  projects: CatalogProject[];
  onChange: (query: KitQuery) => void;
  onClear: () => void;
  search?: string;
  now: string;
  mobile?: boolean;
  onClose?: () => void;
  motionPhase?: "entering" | "entered" | "exiting";
}) {
  const [frontendSearch, setFrontendSearch] = useState("");
  const [purposeSearch, setPurposeSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [creatorSearch, setCreatorSearch] = useState("");
  const [capabilitySearch, setCapabilitySearch] = useState("");
  const includedProjectIds = new Set(
    kits.flatMap((kit) =>
      kit.components.map((component) => component.projectId),
    ),
  );
  const includedProjectOptions = projects
    .filter((project) => includedProjectIds.has(project.id))
    .map((project) => ({
      id: project.id,
      label: project.name,
      count: selectKits(
        kits,
        { ...query, includesProjectId: project.id },
        search,
        now,
      ).length,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
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
  const updateArray = (
    property: Exclude<KitArrayFilter, "creatorIds">,
    value: string,
  ) => {
    const current = query[property] as string[];
    onChange({
      ...query,
      [property]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  };
  const updateCreator = (value: string) => {
    const creatorId = Number(value);
    onChange({
      ...query,
      creatorIds: query.creatorIds.includes(creatorId)
        ? query.creatorIds.filter((item) => item !== creatorId)
        : [...query.creatorIds, creatorId],
    });
  };
  const statusBaseQuery = {
    ...query,
    tavernaryPickOnly: false,
    allComponentsAvailable: false,
  };
  const availableCount = selectKits(
    kits,
    { ...statusBaseQuery, allComponentsAvailable: true },
    search,
    now,
  ).length;
  const pickCount = selectKits(
    kits,
    { ...statusBaseQuery, tavernaryPickOnly: true },
    search,
    now,
  ).length;

  const content = (
    <>
      {mobile ? (
        <FilterSheetHeading
          headingRef={headingRef}
          headingId="kit-filter-heading"
          closeLabel="Close Kit filters"
          onClose={dismiss}
        />
      ) : (
        <FilterPanelTitle onClear={onClear} />
      )}
      <FilterGroup
        title="Compatible frontend"
        options={countedOptions(
          labels(kits, "frontends"),
          kits,
          query,
          "frontends",
          search,
          now,
        )}
        selected={query.frontends}
        onToggle={(value) => updateArray("frontends", value)}
        search={frontendSearch}
        onSearch={setFrontendSearch}
        searchLabel="Search compatible frontends"
        initialVisibleCount={3}
      />
      <FilterGroup
        title="Purpose"
        options={countedOptions(
          labels(kits, "purposes"),
          kits,
          query,
          "purposes",
          search,
          now,
        )}
        selected={query.purposes}
        onToggle={(value) => updateArray("purposes", value)}
        search={purposeSearch}
        onSearch={setPurposeSearch}
        searchLabel="Search Kit purposes"
        presentation="chips"
      />
      <FilterGroup
        title="Includes project"
        options={includedProjectOptions}
        selected={query.includesProjectId ? [query.includesProjectId] : []}
        onToggle={(value) =>
          onChange({
            ...query,
            includesProjectId: value,
          })
        }
        search={projectSearch}
        onSearch={setProjectSearch}
        searchLabel="Search included projects"
        selectionMode="single"
        initialVisibleCount={5}
      />
      <FilterGroup
        title="Kit creator"
        options={countedCreators(kits, query, search, now)}
        selected={query.creatorIds.map(String)}
        onToggle={updateCreator}
        search={creatorSearch}
        onSearch={setCreatorSearch}
        searchLabel="Search Kit creators"
        initialVisibleCount={5}
      />
      <FilterGroup
        title="Included project kind"
        options={countedOptions(kindOptions, kits, query, "kinds", search, now)}
        selected={query.kinds}
        onToggle={(value) => updateArray("kinds", value)}
        kindColors
      />
      <FilterGroup
        title="Capabilities & characteristics"
        options={countedOptions(
          componentCapabilities(kits),
          kits,
          query,
          "capabilities",
          search,
          now,
        )}
        selected={query.capabilities}
        onToggle={(value) => updateArray("capabilities", value)}
        search={capabilitySearch}
        onSearch={setCapabilitySearch}
        searchLabel="Search Kit capabilities and characteristics"
        presentation="chips"
      />
      <FilterGroup
        title="Development"
        options={countedOptions(
          developmentOptions,
          kits,
          query,
          "development",
          search,
          now,
        )}
        selected={query.development}
        onToggle={(value) => updateArray("development", value)}
      />
      <FilterGroup
        title="Included project license"
        options={countedOptions(
          licenseOptions,
          kits,
          query,
          "licenses",
          search,
          now,
        )}
        selected={query.licenses}
        onToggle={(value) => updateArray("licenses", value)}
      />
      <DualRange
        label="Kit size"
        minimumLabel="Minimum projects"
        maximumLabel="Maximum projects"
        min={3}
        max={50}
        value={[query.minProjects, query.maxProjects]}
        onChange={([minProjects, maxProjects]) =>
          onChange({ ...query, minProjects, maxProjects })
        }
      />
      <fieldset className="filter-group">
        <legend>Kit status</legend>
        <label>
          <input
            type="checkbox"
            aria-label="Tavernary Pick"
            checked={query.tavernaryPickOnly}
            onChange={(event) =>
              onChange({
                ...query,
                tavernaryPickOnly: event.target.checked,
              })
            }
          />
          <span>Tavernary Pick</span>
          <b>{pickCount}</b>
        </label>
        <label>
          <input
            type="checkbox"
            aria-label="All components available"
            checked={query.allComponentsAvailable}
            onChange={(event) =>
              onChange({
                ...query,
                allComponentsAvailable: event.target.checked,
              })
            }
          />
          <span>All components available</span>
          <b>{availableCount}</b>
        </label>
      </fieldset>
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
          className="filter-sheet kit-filter-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kit-filter-heading"
          onMouseDown={(event) => event.stopPropagation()}
        >
          {content}
        </section>
      </div>
    );
  }

  return (
    <aside className="filter-panel kit-filter-panel" aria-label="Kit filters">
      {content}
    </aside>
  );
}
