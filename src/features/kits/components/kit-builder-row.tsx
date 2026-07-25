import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import type { KeyboardEventHandler, PointerEventHandler } from "react";

export function KitBuilderRow({
  project,
  onRemove,
  onDragStart,
  onDragKeyDown,
  dragging,
  placement,
  touchLayout,
}: {
  project: CatalogProject;
  onRemove: (projectId: string) => void;
  onDragStart: PointerEventHandler<HTMLButtonElement>;
  onDragKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  dragging: boolean;
  placement: "before" | "after" | null;
  touchLayout: boolean;
}) {
  return (
    <li
      className={`kit-builder-row${dragging ? " dragging" : ""}${placement ? ` drag-${placement}` : ""}`}
      data-project-id={project.id}
    >
      <button
        type="button"
        className="kit-drag-handle"
        aria-label={`Drag ${project.name} to ${touchLayout ? "reorder" : "reorder or remove"}`}
        onPointerDown={onDragStart}
        onKeyDown={onDragKeyDown}
      >
        <CategoryIcon name="drag-handle" />
      </button>
      <span className="kit-builder-row-identity">
        <strong>{project.name}</strong>
        <small>{project.kind}</small>
      </span>
      <button
        type="button"
        className="kit-builder-remove"
        aria-label={`Remove ${project.name}`}
        onClick={() => onRemove(project.id)}
      >
        ×
      </button>
    </li>
  );
}
