import type { CatalogKit } from "@/features/kits/kit-types";
import { KitCard } from "./kit-card";

export function KitGrid({
  kits,
  now,
  selectedKitId,
  onSelect,
  onCopyLink,
  onReport,
}: {
  kits: CatalogKit[];
  now: string;
  selectedKitId: string;
  onSelect: (kitId: string) => void;
  onCopyLink: (kitId: string) => void;
  onReport: (kitId: string) => void;
}) {
  if (kits.length === 0) {
    return (
      <div className="catalog-empty">
        <strong>No Kits have been published yet</strong>
        <span>Create a Kit draft or check back after community review.</span>
      </div>
    );
  }
  return (
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
        />
      ))}
    </section>
  );
}
