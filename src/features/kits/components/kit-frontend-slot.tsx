import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { PointerEventHandler } from "react";

export function KitFrontendSlot({
  project,
  touchLayout,
  dragging,
  onRevealFrontends,
  onRemove,
  onDragStart,
}: {
  project: CatalogProject | null;
  touchLayout: boolean;
  dragging: boolean;
  onRevealFrontends: () => void;
  onRemove: () => void;
  onDragStart: PointerEventHandler<HTMLButtonElement>;
}) {
  return (
    <div
      className={`kit-frontend-slot${dragging ? " dragging" : ""}`}
      data-current-frontend-name={project?.name}
    >
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
            aria-label={`Remove ${project.name} from Kit`}
            aria-pressed="true"
            onClick={onRemove}
          >
            <span aria-hidden="true">−</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          className="kit-frontend-discovery"
          aria-label="Show Frontend cards"
          onClick={onRevealFrontends}
        >
          <strong>Add a Frontend</strong>
          <span>Choose one from the catalog cards</span>
        </button>
      )}
    </div>
  );
}
