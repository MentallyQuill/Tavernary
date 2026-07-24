"use client";

import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { KitQuery } from "@/features/kits/kit-query";
import type { CatalogKit } from "@/features/kits/kit-types";

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
}: {
  query: KitQuery;
  kits: CatalogKit[];
  projects: CatalogProject[];
  onChange: (query: KitQuery) => void;
  onClear: () => void;
  mobile?: boolean;
  onClose?: () => void;
}) {
  const updateArray = (property: "frontends" | "purposes", value: string) => {
    const current = query[property];
    onChange({
      ...query,
      [property]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  };
  const setMinimum = (value: number) =>
    onChange({
      ...query,
      minProjects: Math.min(Math.max(3, value), query.maxProjects),
    });
  const setMaximum = (value: number) =>
    onChange({
      ...query,
      maxProjects: Math.max(Math.min(50, value), query.minProjects),
    });

  return (
    <aside
      className={`filter-panel kit-filter-panel${mobile ? " mobile-filter-sheet" : ""}`}
      aria-label="Kit filters"
    >
      {mobile ? (
        <div className="filter-sheet-header">
          <strong>Kit filters</strong>
          <button type="button" onClick={onClose}>
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
      <fieldset className="filter-group kit-size-filter">
        <legend>Kit size</legend>
        <label>
          Minimum
          <input
            type="range"
            min="3"
            max="50"
            value={query.minProjects}
            onChange={(event) => setMinimum(Number(event.target.value))}
          />
          <input
            type="number"
            min="3"
            max="50"
            aria-label="Minimum projects"
            value={query.minProjects}
            onChange={(event) => setMinimum(Number(event.target.value))}
          />
        </label>
        <label>
          Maximum
          <input
            type="range"
            min="3"
            max="50"
            value={query.maxProjects}
            onChange={(event) => setMaximum(Number(event.target.value))}
          />
          <input
            type="number"
            min="3"
            max="50"
            aria-label="Maximum projects"
            value={query.maxProjects}
            onChange={(event) => setMaximum(Number(event.target.value))}
          />
        </label>
      </fieldset>
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
      <button type="button" className="clear-filters" onClick={onClear}>
        Clear Kit filters
      </button>
    </aside>
  );
}
