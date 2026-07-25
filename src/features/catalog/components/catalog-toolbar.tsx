import type { RefObject } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import type { KitSort } from "@/features/kits/kit-query";
import type { CatalogQuery } from "../catalog-query";

export function CatalogToolbar({
  count,
  query,
  refreshedLabel,
  filterCount,
  onSort,
  onKitSort,
  onDensity,
  onOpenFilters,
  onCreateKit,
  filterButtonRef,
}: {
  count: number;
  query: CatalogQuery;
  refreshedLabel: string;
  filterCount: number;
  onSort: (sort: CatalogQuery["sort"]) => void;
  onKitSort: (sort: KitSort) => void;
  onDensity: () => void;
  onOpenFilters: () => void;
  onCreateKit?: () => void;
  filterButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="catalog-toolbar">
      <div className="catalog-heading">
        <div className="catalog-primary-controls">
          <h1>
            {count}{" "}
            {query.mode === "kits"
              ? count === 1
                ? "Kit"
                : "Kits"
              : count === 1
                ? "project"
                : "projects"}
          </h1>
          {query.mode === "kits" ? (
            <select
              className="sort-kits"
              aria-label="Sort Kits"
              value={query.kits.sort}
              onChange={(event) => onKitSort(event.target.value as KitSort)}
            >
              <option value="trending">Trending</option>
              <option value="newest">Newest</option>
              <option value="updated">Updated</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          ) : (
            <>
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
                <option value="sustained">Sustained Activity</option>
                <option value="popularity">Popularity</option>
                <option value="alphabetical">Alphabetical</option>
              </select>
            </>
          )}
        </div>
        <p>Catalog refreshed {refreshedLabel}</p>
      </div>
      <div className="catalog-toolbar-actions">
        {query.mode === "kits" ? (
          <button
            className="mobile-create-kit"
            type="button"
            onClick={onCreateKit}
          >
            Create Kit
          </button>
        ) : null}
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
    </div>
  );
}
