"use client";

import { useState } from "react";

import { searchTags, type PublicTagDefinition } from "../tag-vocabulary";

export function TagBrowser({
  tags,
  selected,
  onToggle,
  maxSelections,
  counts = {},
  searchLabel,
  limitLabel,
}: {
  tags: readonly PublicTagDefinition[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  maxSelections?: number;
  counts?: Readonly<Record<string, number>>;
  searchLabel: string;
  limitLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = new Set(selected);
  const matchedIds = new Set(searchTags(tags, query).map((tag) => tag.id));
  const visibleTags = tags.filter(
    (tag) => selectedSet.has(tag.id) || matchedIds.has(tag.id),
  );
  const selectionOrder = new Map(selected.map((id, index) => [id, index]));
  const atLimit =
    maxSelections !== undefined && selected.length >= maxSelections;

  function tagsForFacet(facet: PublicTagDefinition["facet"]) {
    return visibleTags
      .filter((tag) => tag.facet === facet)
      .sort((left, right) => {
        const leftSelected = selectionOrder.get(left.id);
        const rightSelected = selectionOrder.get(right.id);
        if (leftSelected !== undefined && rightSelected !== undefined) {
          return leftSelected - rightSelected;
        }
        if (leftSelected !== undefined) return -1;
        if (rightSelected !== undefined) return 1;
        return left.label.localeCompare(right.label);
      });
  }

  const groups = [
    { facet: "goal" as const, label: "Goals" },
    { facet: "trait" as const, label: "Traits" },
  ];

  return (
    <div className="tag-browser">
      <input
        className="filter-search tag-browser-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search tags…"
        aria-label={searchLabel}
      />
      <div className="tag-browser-status">
        <span aria-live="polite">
          {maxSelections === undefined
            ? `${selected.length} selected`
            : `${selected.length} / ${maxSelections} selected`}
        </span>
        {limitLabel ? <span>{limitLabel}</span> : null}
      </div>
      <div className="tag-results-bounded" data-testid="tag-results">
        {groups.map(({ facet, label }) => {
          const groupTags = tagsForFacet(facet);
          return (
            <fieldset className="tag-browser-group" key={facet}>
              <legend>{label}</legend>
              <div className="tag-browser-options">
                {groupTags.map((tag) => {
                  const isSelected = selectedSet.has(tag.id);
                  const isDisabled = !isSelected && atLimit;
                  const count = counts[tag.id];
                  return (
                    <label
                      className={[
                        "tag-browser-option",
                        isSelected ? "selected" : "",
                        isDisabled ? "disabled" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={tag.description}
                      key={tag.id}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isDisabled}
                        aria-label={tag.label}
                        onChange={() => onToggle(tag.id)}
                      />
                      <span className="tag-browser-check" aria-hidden="true">
                        ✓
                      </span>
                      <span>{tag.label}</span>
                      {count !== undefined ? (
                        <span
                          className="tag-browser-count"
                          aria-label={`${count} ${count === 1 ? "project" : "projects"}`}
                        >
                          {count}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        {visibleTags.length === 0 ? (
          <p className="tag-browser-empty">No matching goals or traits.</p>
        ) : null}
      </div>
    </div>
  );
}
