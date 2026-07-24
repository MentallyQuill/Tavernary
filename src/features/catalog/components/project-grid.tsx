import type { CatalogProject } from "../catalog-types";
import { ProjectCard } from "./project-card";

export function ProjectGrid({
  projects,
  now,
}: {
  projects: CatalogProject[];
  now: string;
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
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} now={now} />
      ))}
    </section>
  );
}
