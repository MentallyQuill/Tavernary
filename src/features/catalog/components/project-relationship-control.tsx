import type { CatalogForkRelationship } from "../catalog-types";

export interface ProjectRelationshipControlProps {
  childProjectName: string;
  relationship: CatalogForkRelationship;
  active: boolean;
  onViewRelationship: (() => void) | null;
}

export function ProjectRelationshipControl({
  childProjectName,
  relationship,
  active,
  onViewRelationship,
}: ProjectRelationshipControlProps) {
  const unavailableLabel =
    relationship.status === "not-listed"
      ? "Upstream not listed"
      : "Upstream unavailable";
  const canView =
    relationship.status === "published" && !active && onViewRelationship;

  return (
    <div className="project-relationship-control">
      <span className="project-relationship-origin">
        Fork of {relationship.parentName}
      </span>
      {canView ? (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            aria-label={`View relationship between ${relationship.parentName} and ${childProjectName}`}
            onClick={onViewRelationship}
          >
            View relationship
          </button>
        </>
      ) : relationship.status !== "published" ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{unavailableLabel}</span>
        </>
      ) : null}
    </div>
  );
}
