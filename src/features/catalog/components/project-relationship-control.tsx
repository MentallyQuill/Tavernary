import type { ReactNode } from "react";

import type { CatalogForkRelationship } from "../catalog-types";

export interface ProjectRelationshipControlProps {
  childProjectName: string;
  relationship: CatalogForkRelationship;
  license: ReactNode;
  active: boolean;
  onViewRelationship: (() => void) | null;
}

export function ProjectRelationshipControl({
  childProjectName,
  relationship,
  license,
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
      {license}
      <span className="project-relationship-separator" aria-hidden="true">
        ·
      </span>
      {canView ? (
        <button
          type="button"
          aria-label={`View relationship between ${relationship.parentName} and ${childProjectName}`}
          onClick={onViewRelationship}
        >
          Fork of {relationship.parentName}
        </button>
      ) : (
        <span className="project-relationship-origin">
          Fork of {relationship.parentName}
        </span>
      )}
      {relationship.status !== "published" ? (
        <>
          <span className="project-relationship-separator" aria-hidden="true">
            ·
          </span>
          <span>{unavailableLabel}</span>
        </>
      ) : null}
    </div>
  );
}
