import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { PointerEventHandler } from "react";

export function KitFrontendSlot({
  project,
  touchLayout,
  dragging,
  onRemove,
  onDragStart,
}: {
  project: CatalogProject | null;
  touchLayout: boolean;
  dragging: boolean;
  onRemove: () => void;
  onDragStart: PointerEventHandler<HTMLButtonElement>;
}) {
  return (
    <div className={`kit-frontend-slot${dragging ? " dragging" : ""}`}>
      {project ? (
        <>
          {!touchLayout ? (
            <button
              type="button"
              className="kit-drag-handle"
              aria-label={`Drag ${project.name} to remove`}
              onPointerDown={onDragStart}
            >
              <CategoryIcon name="drag-handle" />
            </button>
          ) : null}
          <strong>{project.name}</strong>
          <button
            type="button"
            className="kit-builder-remove"
            aria-label={`Remove ${project.name}`}
            onClick={onRemove}
          >
            ×
          </button>
        </>
      ) : (
        <span>Choose one Frontend</span>
      )}
    </div>
  );
}
