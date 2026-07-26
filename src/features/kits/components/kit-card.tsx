import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogKit } from "@/features/kits/kit-types";

function relativeTime(timestamp: string, now: string) {
  const days = Math.max(
    0,
    Math.floor((Date.parse(now) - Date.parse(timestamp)) / 86_400_000),
  );
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function KitCard({
  kit,
  now,
  selected,
  onSelect,
  onCopyLink,
  onReport,
}: {
  kit: CatalogKit;
  now: string;
  selected: boolean;
  onSelect: (kitId: string) => void;
  onCopyLink: (kitId: string) => void;
  onReport: (kitId: string) => void;
}) {
  const wasUpdated = kit.updatedAt !== kit.publishedAt;
  return (
    <article
      className={`kit-card${selected ? " selected" : ""}`}
      aria-labelledby={`${kit.id}-title`}
    >
      <button
        type="button"
        className="kit-card-select"
        aria-label={`Open ${kit.title}`}
        aria-controls="kit-builder-panel"
        aria-expanded={selected}
        onClick={() => onSelect(kit.id)}
      >
        <span className="kit-card-heading">
          <CategoryIcon name="kit" />
          <span>
            <h2 id={`${kit.id}-title`}>{kit.title}</h2>
            <small>@{kit.author.login}</small>
          </span>
        </span>
        <p className="kit-card-description">{kit.description}</p>
      </button>
      <div className="kit-card-metadata">
        <span>
          {kit.supporterCount === null
            ? "Support unavailable"
            : `${kit.supporterCount} ${kit.supporterCount === 1 ? "supporter" : "supporters"}`}
        </span>
        <span>{kit.components.length} projects</span>
        <span>Published {relativeTime(kit.publishedAt, now)}</span>
        {wasUpdated ? (
          <span>Updated {relativeTime(kit.updatedAt, now)}</span>
        ) : null}
      </div>
      <div className="kit-card-badges">
        {kit.flaggedProjectCount > 0 ? (
          <b className="kit-caution">
            <CategoryIcon name="caution" />
            Contains flagged projects
          </b>
        ) : null}
      </div>
      <div className="kit-card-actions">
        <button
          type="button"
          aria-label="Copy link"
          onClick={() => onCopyLink(kit.id)}
        >
          <CategoryIcon name="copy-link" />
          Copy link
        </button>
        <button
          type="button"
          aria-label="Report Kit"
          onClick={() => onReport(kit.id)}
        >
          <CategoryIcon name="report" />
          Report
        </button>
      </div>
    </article>
  );
}
