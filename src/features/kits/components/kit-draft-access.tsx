import { CategoryIcon } from "@/components/icons/category-icon";

export type DraftAccessStatus =
  | { phase: "settled"; draftCount: number }
  | { phase: "added"; addedCount: number; draftCount: number };

function projectsLabel(count: number) {
  return `${count} ${count === 1 ? "project" : "projects"}`;
}

export function KitDraftAccess({
  variant,
  status,
  onOpen,
}: {
  variant: "rail" | "pill";
  status: DraftAccessStatus | null;
  onOpen: () => void;
}) {
  if (!status) return null;

  const accessibleName = `Open Kit Builder, ${projectsLabel(
    status.draftCount,
  )} in draft`;
  const visibleStatus =
    status.phase === "added"
      ? `${projectsLabel(status.addedCount)} added`
      : `${projectsLabel(status.draftCount)} in draft`;

  if (variant === "pill") {
    return (
      <button
        type="button"
        className="kit-draft-pill"
        aria-label={accessibleName}
        onClick={onOpen}
      >
        <CategoryIcon name="kit-builder" />
        <span className="kit-draft-pill-label">Kit draft</span>
        <span className="kit-draft-access-status">{visibleStatus}</span>
      </button>
    );
  }

  return (
    <div className="kit-builder-rail">
      <button
        type="button"
        className="kit-builder-toggle"
        aria-label={accessibleName}
        onClick={onOpen}
      >
        <CategoryIcon name="kit-builder" />
      </button>
      <span>Kit Builder</span>
      <span className="kit-builder-rail-status" aria-hidden="true">
        {visibleStatus}
      </span>
    </div>
  );
}
