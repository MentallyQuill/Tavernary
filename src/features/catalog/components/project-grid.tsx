import type { CatalogProject } from "../catalog-types";
import { CategoryIcon } from "@/components/icons/category-icon";
import type { ProjectSelectionBindings } from "@/features/kits/use-project-batch-selection";
import type { PointerEventHandler } from "react";
import { ProjectCard, projectDisplayName } from "./project-card";

export function ProjectGrid({
  projects,
  now,
  selection,
  onProjectDragStart,
}: {
  projects: CatalogProject[];
  now: string;
  selection?: {
    mode: boolean;
    bindingsFor: (projectId: string) => ProjectSelectionBindings;
  };
  onProjectDragStart?: (
    project: CatalogProject,
    event: Parameters<PointerEventHandler<HTMLButtonElement>>[0],
  ) => void;
}) {
  if (projects.length === 0) {
    return (
      <div className="catalog-empty">
        <strong>No projects match this view</strong>
        <span>Try a broader search or clear your filters.</span>
      </div>
    );
  }

  return (
    <section className="project-grid" aria-label="Project catalog">
      {projects.map((project) => {
        if (!selection && !onProjectDragStart) {
          return <ProjectCard key={project.id} project={project} now={now} />;
        }
        const bindings = selection?.bindingsFor(project.id);
        return (
          <div
            className={[
              "project-card-shell",
              onProjectDragStart ? "drag-enabled" : "",
              bindings?.selected ? "selected" : "",
              bindings?.inDraft ? "in-draft" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={project.id}
            role={selection?.mode ? "group" : undefined}
            aria-roledescription={
              selection?.mode ? "selectable project" : undefined
            }
            aria-label={
              selection?.mode
                ? `${projectDisplayName(project.name)}, ${
                    bindings?.selected ? "selected" : "not selected"
                  }`
                : undefined
            }
            aria-keyshortcuts={selection?.mode ? "Space Enter" : undefined}
            tabIndex={selection?.mode ? 0 : undefined}
            onPointerDown={bindings?.onPointerDown}
            onPointerMove={bindings?.onPointerMove}
            onPointerUp={bindings?.onPointerUp}
            onPointerCancel={bindings?.onPointerCancel}
            onClick={bindings?.onClick}
            onKeyDown={bindings?.onKeyDown}
          >
            <ProjectCard project={project} now={now} />
            {bindings?.selected ? (
              <span className="project-selection-check" aria-label="Selected">
                ✓
              </span>
            ) : null}
            {bindings?.inDraft ? (
              <span className="project-in-draft">In Kit</span>
            ) : null}
            {onProjectDragStart ? (
              <button
                type="button"
                className="catalog-project-drag-handle"
                data-project-drag-handle
                aria-label={`Drag ${project.name} into Kit`}
                onPointerDown={(event) => onProjectDragStart(project, event)}
              >
                <CategoryIcon name="drag-handle" />
              </button>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
