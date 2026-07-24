import type { RefObject } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogQuery } from "../catalog-query";

export function CatalogToolbar({
  count,
  query,
  refreshedLabel,
  filterCount,
  onSort,
  onDensity,
  onOpenFilters,
  filterButtonRef,
}: {
  count: number;
  query: CatalogQuery;
  refreshedLabel: string;
  filterCount: number;
  onSort: (sort: CatalogQuery["sort"]) => void;
  onDensity: () => void;
  onOpenFilters: () => void;
  filterButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="catalog-toolbar">
      <div className="catalog-heading">
        <div className="catalog-primary-controls">
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
            <CategoryIcon name="collapse" />
          </button>
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
        <p>Catalog refreshed {refreshedLabel}</p>
      </div>
      <button
        ref={filterButtonRef}
        className="filter-toggle"
        type="button"
        aria-label="Open filters"
        onClick={onOpenFilters}
      >
        <CategoryIcon name="filter-lines" />
        {filterCount > 0 ? <b>{filterCount}</b> : null}
      </button>
    </div>
  );
}
