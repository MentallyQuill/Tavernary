import type { CatalogKit } from "@/features/kits/kit-types";
import {
  SearchCorrection,
  SearchEmptyState,
  type SearchFeedback,
} from "@/features/search/components/search-empty-state";
import type { SearchEvidence } from "@/features/search/search-types";
import { KitCard } from "./kit-card";

export function KitGrid({
  kits,
  now,
  selectedKitId,
  onSelect,
  onCopyLink,
  onReport,
  searchEvidenceById = new Map(),
  searchFeedback,
}: {
  kits: CatalogKit[];
  now: string;
  selectedKitId: string;
  onSelect: (kitId: string) => void;
  onCopyLink: (kitId: string) => void | Promise<void>;
  onReport: (kitId: string) => void;
  searchEvidenceById?: ReadonlyMap<string, SearchEvidence[]>;
  searchFeedback?: SearchFeedback;
}) {
  if (kits.length === 0) {
    return searchFeedback ? (
      <SearchEmptyState mode="kits" {...searchFeedback} />
    ) : (
      <SearchEmptyState
        mode="kits"
        query=""
        textMatchCount={0}
        activeFilterCount={0}
        correction={null}
        onUseCorrection={() => undefined}
      />
    );
  }
  return (
    <>
      {searchFeedback?.correction ? (
        <SearchCorrection
          correction={searchFeedback.correction}
          onUseCorrection={searchFeedback.onUseCorrection}
        />
      ) : null}
      <section className="kit-grid" aria-label="Kit catalog">
        {kits.map((kit) => (
          <KitCard
            key={kit.id}
            kit={kit}
            now={now}
            selected={selectedKitId === kit.id}
            onSelect={onSelect}
            onCopyLink={onCopyLink}
            onReport={onReport}
            searchEvidence={searchEvidenceById.get(kit.id)}
          />
        ))}
      </section>
    </>
  );
}
