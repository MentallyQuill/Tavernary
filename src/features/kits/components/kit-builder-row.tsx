import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogProject } from "@/features/catalog/catalog-types";

export function KitBuilderRow({
  project,
  index,
  count,
  onMove,
  onRemove,
}: {
  project: CatalogProject;
  index: number;
  count: number;
  onMove: (index: number, delta: number) => void;
  onRemove: (projectId: string) => void;
}) {
  return (
    <li className="kit-builder-row" data-project-id={project.id}>
      <span className="kit-drag-handle" aria-hidden="true">
        <CategoryIcon name="drag-handle" />
      </span>
      <span>
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
