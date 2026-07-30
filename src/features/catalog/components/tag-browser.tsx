"use client";

import { useState } from "react";

import { FilterChoiceChip } from "./filter-choice-chip";
import { searchTags, type PublicTagDefinition } from "../tag-vocabulary";

export const TAG_FACET_PREVIEW_LIMIT = 8;

export function TagBrowser({
  tags,
  selected,
  onToggle,
  previewLimit,
  maxSelections,
  counts = {},
  searchLabel,
  limitLabel,
}: {
  tags: readonly PublicTagDefinition[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  previewLimit: number;
  maxSelections?: number;
  counts?: Readonly<Record<string, number>>;
  searchLabel: string;
  limitLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [expandedFacets, setExpandedFacets] = useState({
    goal: false,
    trait: false,
  });
  const selectedSet = new Set(selected);
  const searching = query.trim().length > 0;
  const matchedIds = new Set(searchTags(tags, query).map((tag) => tag.id));
  const selectedTags = selected
    .map((id) => tags.find((tag) => tag.id === id))
    .filter((tag): tag is PublicTagDefinition => tag !== undefined);
  const atLimit =
    maxSelections !== undefined && selected.length >= maxSelections;

  function tagsForFacet(facet: PublicTagDefinition["facet"]) {
    return tags
      .filter(
        (tag) => tag.facet === facet && (!searching || matchedIds.has(tag.id)),
      )
      .sort(
        (left, right) =>
          (counts[right.id] ?? 0) - (counts[left.id] ?? 0) ||
          left.label.localeCompare(right.label),
      );
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
      {selectedTags.length > 0 ? (
        <div
          className="tag-browser-selected"
          aria-label="Selected goals and traits"
        >
          {selectedTags.map((tag) => (
            <button
              className="filter-selected-chip"
              type="button"
              aria-label={`Remove ${tag.label}`}
              onClick={() => onToggle(tag.id)}
              key={tag.id}
            >
              <span aria-hidden="true">{"\u2713"}</span>
              <span>{tag.label}</span>
              <span aria-hidden="true">{"\u00d7"}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="tag-browser-facets">
        {groups.map(({ facet, label }) => {
          const groupTags = tagsForFacet(facet);
          if (groupTags.length === 0) return null;
          const expanded = expandedFacets[facet];
          const visibleGroupTags =
            searching || expanded
              ? groupTags
              : groupTags.slice(0, previewLimit);
          const hiddenCount = groupTags.length - visibleGroupTags.length;
          return (
            <fieldset className="tag-browser-group" key={facet}>
              <legend>{label}</legend>
              <div className="tag-browser-options">
                {visibleGroupTags.map((tag) => {
                  const isSelected = selectedSet.has(tag.id);
                  const isDisabled = !isSelected && atLimit;
                  return (
                    <FilterChoiceChip
                      className="tag-browser-option"
                      label={tag.label}
                      count={counts[tag.id]}
                      checked={isSelected}
                      disabled={isDisabled}
                      title={tag.description}
                      onChange={() => onToggle(tag.id)}
                      key={tag.id}
                    />
                  );
                })}
              </div>
              {!searching && (hiddenCount > 0 || expanded) ? (
                <button
                  className="more-frontends tag-browser-disclosure"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedFacets((current) => ({
                      ...current,
                      [facet]: !current[facet],
                    }))
                  }
                >
                  {expanded ? "Show fewer" : `Show ${hiddenCount} more`}
                </button>
              ) : null}
            </fieldset>
          );
        })}
        {searching && matchedIds.size === 0 ? (
          <p className="tag-browser-empty">No matching goals or traits.</p>
        ) : null}
      </div>
    </div>
  );
}
