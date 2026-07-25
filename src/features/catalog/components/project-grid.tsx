import type { CatalogProject } from "../catalog-types";
import { CategoryIcon } from "@/components/icons/category-icon";
import type { ProjectSelectionBindings } from "@/features/kits/use-project-batch-selection";
import type { PointerEventHandler } from "react";
import { ProjectCard, projectDisplayName } from "./project-card";
import { ProjectKitControl } from "./project-kit-control";

export function ProjectGrid({
  projects,
  now,
  selection,
  onProjectDragStart,
}: {
  projects: CatalogProject[];
  now: string;
  selection: {
    mode?: boolean;
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
        const bindings = selection.bindingsFor(project.id);
        const displayName = projectDisplayName(project.name);
        return (
          <div
            className={[
              "project-card-shell",
              "has-kit-control",
              onProjectDragStart ? "drag-enabled" : "",
              bindings.state === "selected" ? "selected" : "",
              bindings.state === "in-kit" ? "in-draft" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={project.id}
          >
            <ProjectCard project={project} now={now} />
            <span className="project-kit-control-hit">
              <ProjectKitControl
                projectName={displayName}
                bindings={bindings}
              />
            </span>
            {bindings.state === "in-kit" ? (
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
