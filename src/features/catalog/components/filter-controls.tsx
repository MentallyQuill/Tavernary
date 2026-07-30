"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";

import { CategoryIcon } from "@/components/icons/category-icon";
import { FilterChoiceChip } from "@/features/catalog/components/filter-choice-chip";

export interface FilterOption {
  id: string;
  label: string;
  count: number;
}

export function FilterPanelTitle({ onClear }: { onClear: () => void }) {
  return (
    <div className="filter-panel-title">
      <span>Filters</span>
      <button type="button" onClick={onClear}>
        Clear all
      </button>
    </div>
  );
}

export function FilterSheetHeading({
  headingRef,
  headingId,
  closeLabel,
  onClose,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  headingId: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="filter-sheet-heading">
      <div>
        <small>Refine catalog</small>
        <h2 ref={headingRef} id={headingId} tabIndex={-1}>
          Filters
        </h2>
      </div>
      <button type="button" aria-label={closeLabel} onClick={onClose}>
        <CategoryIcon name="close" />
      </button>
    </div>
  );
}

export function FilterGroup({
  title,
  options,
  selected,
  onToggle,
  search,
  onSearch,
  searchLabel,
  presentation = "list",
  selectionMode = "multiple",
  initialVisibleCount,
  kindColors = false,
}: {
  title: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  search?: string;
  onSearch?: (value: string) => void;
  searchLabel?: string;
  presentation?: "list" | "chips";
  selectionMode?: "multiple" | "single";
  initialVisibleCount?: number;
  kindColors?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [chipsOverflow, setChipsOverflow] = useState(false);
  const chipListRef = useRef<HTMLDivElement>(null);
  const normalizedSearch = search?.trim().toLocaleLowerCase() ?? "";
  const collapseLimit = initialVisibleCount ?? options.length;
  const pinned = options.slice(0, collapseLimit);
  const selectedExtras = options.filter(
    (option, index) => index >= collapseLimit && selected.includes(option.id),
  );
  const collapsedIds = new Set(
    [...pinned, ...selectedExtras].map(({ id }) => id),
  );
  const collapsedOptions = options.filter(({ id }) => collapsedIds.has(id));
  const searchedOptions = normalizedSearch
    ? options.filter(({ label }) =>
        label.toLocaleLowerCase().includes(normalizedSearch),
      )
    : options;
  const visibleOptions = normalizedSearch
    ? searchedOptions
    : expanded
      ? options
      : collapsedOptions;
  const hiddenCount = options.length - collapsedOptions.length;

  useLayoutEffect(() => {
    if (presentation !== "chips" || !chipListRef.current) return;
    const list = chipListRef.current;
    const measure = () => {
      const rowCount = new Set(
        Array.from(list.children).map((child) =>
          Math.round((child as HTMLElement).offsetTop),
        ),
      ).size;
      setChipsOverflow(rowCount > 4);
    };
    if (typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    measure();
    return () => observer.disconnect();
  }, [expanded, options, presentation, selected]);

  if (options.length === 0) return null;

  return (
    <fieldset className="filter-group">
      <legend>{title}</legend>
      {onSearch && searchLabel ? (
        <input
          className={
            presentation === "chips"
              ? "filter-search metadata-search"
              : "filter-search"
          }
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search…"
          aria-label={searchLabel}
        />
      ) : null}
      {presentation === "chips" ? (
        <div
          ref={chipListRef}
          className={`metadata-options${expanded ? "" : " collapsed"}`}
        >
          {visibleOptions.map((option) => {
            const isSelected = selected.includes(option.id);
            return (
              <FilterChoiceChip
                className="metadata-option"
                type={selectionMode === "single" ? "radio" : "checkbox"}
                name={selectionMode === "single" ? title : undefined}
                label={option.label}
                count={option.count}
                checked={isSelected}
                onChange={() => onToggle(option.id)}
                key={option.id}
              />
            );
          })}
        </div>
      ) : (
        visibleOptions.map((option) => (
          <label key={option.id}>
            <input
              type={selectionMode === "single" ? "radio" : "checkbox"}
              name={selectionMode === "single" ? title : undefined}
              aria-label={option.label}
              checked={selected.includes(option.id)}
              className={kindColors ? "kind-checkbox" : undefined}
              data-kind={kindColors ? option.id : undefined}
              onChange={() => onToggle(option.id)}
            />
            <span>{option.label}</span>
            <b>{option.count}</b>
          </label>
        ))
      )}
      {presentation === "list" &&
      !normalizedSearch &&
      (hiddenCount > 0 || expanded) ? (
        <button
          className="more-frontends"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer" : `Show ${hiddenCount} more`}
        </button>
      ) : null}
      {presentation === "chips" && (chipsOverflow || expanded) ? (
        <button
          className="more-frontends metadata-disclosure"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer" : "Show more"}
        </button>
      ) : null}
    </fieldset>
  );
}

export function FilterLegal() {
  return (
    <div className="filter-legal">
      <span>Tavernary</span>
      <span aria-hidden="true">·</span>
      <a href="https://github.com/MentallyQuill/Tavernary/blob/main/LICENSE">
        AGPL-3.0-only
      </a>
      <span aria-hidden="true">·</span>
      <Link href="/about#legal-information">Legal information</Link>
    </div>
  );
}
