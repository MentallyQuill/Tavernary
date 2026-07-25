import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { PointerEventHandler } from "react";

export function KitBuilderRow({
  project,
  index,
  count,
  onMove,
  onRemove,
  onDragStart,
  dragging,
  placement,
  touchLayout,
}: {
  project: CatalogProject;
  index: number;
  count: number;
  onMove: (index: number, delta: number) => void;
  onRemove: (projectId: string) => void;
  onDragStart: PointerEventHandler<HTMLButtonElement>;
  dragging: boolean;
  placement: "before" | "after" | null;
  touchLayout: boolean;
}) {
  return (
    <li
      className={`kit-builder-row${dragging ? " dragging" : ""}${placement ? ` drag-${placement}` : ""}`}
      data-project-id={project.id}
    >
      {!touchLayout ? (
        <button
          type="button"
          className="kit-drag-handle"
          aria-label={`Drag ${project.name}`}
          onPointerDown={onDragStart}
        >
          <CategoryIcon name="drag-handle" />
        </button>
      ) : null}
      <span className="kit-builder-row-identity">
        <strong>{project.name}</strong>
        <small>{project.kind}</small>
      </span>
      <span className="kit-builder-row-actions">
        <button
          type="button"
          aria-label={`Move ${project.name} up`}
          disabled={index === 0}
          onClick={() => onMove(index, -1)}
        >
          Move up
        </button>
        <button
          type="button"
          aria-label={`Move ${project.name} down`}
          disabled={index === count - 1}
          onClick={() => onMove(index, 1)}
        >
          Move down
        </button>
        <button
          type="button"
          aria-label={`Remove ${project.name}`}
          onClick={() => onRemove(project.id)}
        >
          Remove
        </button>
      </span>
    </li>
  );
}
