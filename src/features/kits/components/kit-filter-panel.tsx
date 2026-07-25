"use client";

import { useRef } from "react";

import { DualRange } from "@/components/ui/dual-range";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { KitQuery } from "@/features/kits/kit-query";
import type { CatalogKit } from "@/features/kits/kit-types";
import { useModalSurface } from "@/hooks/use-modal-surface";

const modalBackground = [".site-header", ".mobile-category", ".catalog-layout"];

function labels(kits: CatalogKit[], property: "frontends" | "purposes") {
  const values = new Map<string, string>();
  for (const kit of kits) {
    for (const item of kit[property]) values.set(item.id, item.label);
  }
  return [...values].map(([id, label]) => ({ id, label }));
}

export function KitFilterPanel({
  query,
  kits,
  projects,
  onChange,
  onClear,
  mobile = false,
  onClose,
  motionPhase = "entered",
}: {
  query: KitQuery;
  kits: CatalogKit[];
  projects: CatalogProject[];
  onChange: (query: KitQuery) => void;
  onClear: () => void;
  mobile?: boolean;
  onClose?: () => void;
  motionPhase?: "entering" | "entered" | "exiting";
}) {
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
  const updateArray = (property: "frontends" | "purposes", value: string) => {
    const current = query[property];
    onChange({
      ...query,
      [property]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  };
  const content = (
    <>
      {mobile ? (
        <div className="filter-sheet-heading">
          <div>
            <small>Refine catalog</small>
            <h2 ref={headingRef} id="kit-filter-heading" tabIndex={-1}>
              Kit filters
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close Kit filters"
            onClick={dismiss}
          >
            Close
          </button>
        </div>
      ) : null}
      <fieldset className="filter-group">
        <legend>Frontends</legend>
        {labels(kits, "frontends").map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={query.frontends.includes(item.id)}
              onChange={() => updateArray("frontends", item.id)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="filter-group">
        <legend>Purposes</legend>
        {labels(kits, "purposes").map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={query.purposes.includes(item.id)}
              onChange={() => updateArray("purposes", item.id)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="filter-group">
        <legend>Includes project</legend>
        <input
          type="search"
          list="kit-project-options"
          aria-label="Includes project"
          value={query.includesProjectId}
          onChange={(event) =>
            onChange({ ...query, includesProjectId: event.target.value })
          }
        />
        <datalist id="kit-project-options">
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </datalist>
      </fieldset>
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
      <label className="kit-pick-filter">
        <input
          type="checkbox"
          checked={query.tavernaryPickOnly}
          onChange={(event) =>
            onChange({ ...query, tavernaryPickOnly: event.target.checked })
          }
        />
        Tavernary Pick only
      </label>
      <button
        type="button"
        className="control-quiet clear-filters"
        onClick={onClear}
      >
        Clear Kit filters
      </button>
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
