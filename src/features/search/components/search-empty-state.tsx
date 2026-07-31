import { searchMeaning } from "../search-normalization";

export interface SearchFeedback {
  query: string;
  textMatchCount: number;
  activeFilterCount: number;
  correction: string | null;
  onUseCorrection: (correction: string) => void;
  onClearFilters?: () => void;
}

export function SearchCorrection({
  correction,
  onUseCorrection,
}: {
  correction: string;
  onUseCorrection: (correction: string) => void;
}) {
  return (
    <div className="search-correction">
      <button
        type="button"
        aria-label={`Search for ${correction}`}
        onClick={() => onUseCorrection(correction)}
      >
        Search instead for <b>{correction}</b>
      </button>
    </div>
  );
}

export function SearchEmptyState({
  mode,
  query,
  textMatchCount,
  activeFilterCount,
  correction,
  onUseCorrection,
  onClearFilters,
}: SearchFeedback & { mode: "projects" | "kits" }) {
  if (!searchMeaning(query)) {
    return (
      <div className="catalog-empty">
        <strong>
          {mode === "kits"
            ? "No Kits have been published yet"
            : "No projects match this view"}
        </strong>
        <span>
          {mode === "kits"
            ? "Create a Kit draft or check back after community review."
            : "Try a broader search or clear your filters."}
        </span>
      </div>
    );
  }

  if (textMatchCount > 0 && activeFilterCount > 0) {
    const noun = textMatchCount === 1 ? "match is" : "matches are";
    return (
      <div className="catalog-empty search-empty-state">
        <strong>
          {textMatchCount} search {noun} hidden by filters
        </strong>
        <span>The search text matched, but the active filters exclude it.</span>
        {onClearFilters ? (
          <button type="button" onClick={onClearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="catalog-empty search-empty-state">
      <strong>
        No {mode === "kits" ? "Kit" : "project"} matches all search terms
      </strong>
      <span>
        {correction
          ? "All terms are required. Check the suggested spelling."
          : "Try removing a term."}
      </span>
      {correction ? (
        <SearchCorrection
          correction={correction}
          onUseCorrection={onUseCorrection}
        />
      ) : null}
    </div>
  );
}
