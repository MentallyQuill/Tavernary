import type { CatalogProject } from "../catalog-types";
import { CategoryIcon } from "@/components/icons/category-icon";
import { ProjectCard } from "./project-card";

export function ProjectGrid({
  projects,
  now,
  draftProjectIds,
  onAddToKit,
}: {
  projects: CatalogProject[];
  now: string;
  draftProjectIds?: string[];
  onAddToKit?: (projectId: string) => void;
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
      {projects.map((project) =>
        onAddToKit && draftProjectIds ? (
          <div className="project-card-shell" key={project.id}>
            <ProjectCard project={project} now={now} />
            <button
              type="button"
              className="add-to-kit"
              aria-label={`Add ${project.name} to Kit`}
              disabled={draftProjectIds.includes(project.id)}
              onClick={() => onAddToKit(project.id)}
            >
              <CategoryIcon name="add-to-kit" />
              Add to Kit
            </button>
          </div>
        ) : (
          <ProjectCard key={project.id} project={project} now={now} />
        ),
      )}
    </section>
  );
}
