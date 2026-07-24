import type { RefObject } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogQuery } from "../catalog-query";

export function CatalogToolbar({
  count,
  query,
  refreshedLabel,
  filterCount,
  onView,
  onSort,
  onDensity,
  onOpenFilters,
  filterButtonRef,
}: {
  count: number;
  query: CatalogQuery;
  refreshedLabel: string;
  filterCount: number;
  onView: (view: CatalogQuery["view"]) => void;
  onSort: (sort: CatalogQuery["sort"]) => void;
  onDensity: () => void;
  onOpenFilters: () => void;
  filterButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="catalog-toolbar">
      <div className="catalog-heading">
        <div>
          <h1>
            {count} {count === 1 ? "project" : "projects"}
          </h1>
          <button
            className="density-toggle"
            type="button"
            aria-label={
              query.density === "standard"
                ? "Use compact cards"
                : "Use standard cards"
            }
            aria-pressed={query.density === "compact"}
            onClick={onDensity}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
        <p>Catalog refreshed {refreshedLabel}</p>
      </div>
      <div className="catalog-controls">
        <button
          ref={filterButtonRef}
          className="filter-toggle"
          type="button"
          aria-label="Open filters"
          onClick={onOpenFilters}
        >
          <CategoryIcon name="filter" />
          {filterCount > 0 ? <b>{filterCount}</b> : null}
        </button>
        <div className="view-tabs" aria-label="Catalog view">
          {(["all", "active", "new", "released"] as const).map((view) => (
            <button
              key={view}
              className={query.view === view ? "active" : ""}
              type="button"
              aria-pressed={query.view === view}
              onClick={() => onView(view)}
            >
              {view[0].toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>
        <select
          className="sort-projects"
          aria-label="Sort projects"
          value={query.sort}
          onChange={(event) =>
            onSort(event.target.value as CatalogQuery["sort"])
          }
        >
          <option value="recent">Recent Activity</option>
          <option value="strength">Activity Strength</option>
          <option value="popularity">Popularity</option>
          <option value="alphabetical">Alphabetical</option>
        </select>
      </div>
    </div>
  );
}
