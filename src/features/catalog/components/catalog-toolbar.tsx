import type { RefObject } from "react";
import Link from "next/link";

import { CategoryIcon } from "@/components/icons/category-icon";
import { Tooltip } from "@/components/ui/tooltip";
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
  const densityAction =
    query.density === "standard" ? "Use compact cards" : "Use standard cards";

  return (
    <div className="catalog-toolbar">
      <div className="catalog-heading">
        <p className="catalog-safety-disclosure">
          <Link href="/about#safety-security">
            Safety: Tavernary does not security-review or guarantee listed
            third-party projects. Review a project carefully before installing
            it or providing credentials.
          </Link>
        </p>
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
              className="control-select sort-kits"
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
              <Tooltip
                id="catalog-density-tooltip"
                label={densityAction}
                className="control-tooltip"
              >
                <button
                  className="control-icon density-toggle"
                  type="button"
                  aria-label={densityAction}
                  aria-pressed={query.density === "compact"}
                  onClick={onDensity}
                >
                  <CategoryIcon name="collapse" />
                </button>
              </Tooltip>
              <select
                className="control-select sort-projects"
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
            className="control-primary mobile-create-kit"
            type="button"
            onClick={onCreateKit}
          >
            Create Kit
          </button>
        ) : null}
        <button
          ref={filterButtonRef}
          className="control-icon filter-toggle"
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
