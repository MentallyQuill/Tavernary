import type { CatalogProject } from "../catalog-types";
import { CategoryIcon } from "@/components/icons/category-icon";
import { ProjectCard } from "./project-card";

export function ProjectGrid({
  projects,
  now,
  draftProjectIds,
  draftFrontendId,
  onAddToKit,
}: {
  projects: CatalogProject[];
  now: string;
  draftProjectIds?: string[];
  draftFrontendId?: string | null;
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
      {projects.map((project) => {
        if (!onAddToKit || !draftProjectIds) {
          return <ProjectCard key={project.id} project={project} now={now} />;
        }
        const added = draftProjectIds.includes(project.id);
        const replacesFrontend =
          project.kind === "frontend" &&
          Boolean(draftFrontendId) &&
          project.id !== draftFrontendId;
        return (
          <div className="project-card-shell" key={project.id}>
            <ProjectCard project={project} now={now} />
            <button
              type="button"
              className="add-to-kit"
              aria-label={
                added
                  ? `${project.name} added to Kit`
                  : replacesFrontend
                    ? `Use ${project.name} instead`
                  : `Add ${project.name} to Kit`
              }
              disabled={added}
              onClick={() => onAddToKit(project.id)}
            >
              <CategoryIcon name="add-to-kit" />
              {added ? "Added" : replacesFrontend ? "Use instead" : "Add to Kit"}
            </button>
          </div>
        );
      })}
    </section>
  );
}
