import Link from "next/link";

import type { CatalogProject } from "../catalog-types";
import type { ProjectSelectionBindings } from "@/features/kits/use-project-batch-selection";
import {
  ProjectCard,
  ProjectLicense,
  projectDisplayName,
} from "./project-card";
import { ProjectKitControl } from "./project-kit-control";
import { ProjectRelationshipControl } from "./project-relationship-control";

export function ProjectGrid({
  projects,
  now,
  selection,
  relationshipChildId = "",
  onViewRelationship = () => undefined,
}: {
  projects: CatalogProject[];
  now: string;
  selection: {
    mode?: boolean;
    bindingsFor: (projectId: string) => ProjectSelectionBindings;
  };
  relationshipChildId?: string;
  onViewRelationship?: (childProjectId: string) => void;
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
    <section
      className={`project-grid${relationshipChildId ? " relationship-pair" : ""}`}
      aria-label="Project catalog"
    >
      {projects.map((project) => {
        const bindings = selection.bindingsFor(project.id);
        const displayName = projectDisplayName(project.name);
        const relationshipActive = project.id === relationshipChildId;
        return (
          <div
            className={[
              "project-card-shell",
              "has-kit-control",
              project.fork ? "has-relationship-control" : "",
              bindings.state === "selected" ? "selected" : "",
              bindings.state === "in-kit" ? "in-draft" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            key={project.id}
          >
            <ProjectCard
              project={project}
              now={now}
              licensePlacement={project.fork ? "relationship" : "card"}
            />
            {project.fork ? (
              <ProjectRelationshipControl
                childProjectName={displayName}
                relationship={project.fork}
                license={<ProjectLicense project={project} />}
                active={relationshipActive}
                onViewRelationship={
                  project.fork.status === "published" && !relationshipActive
                    ? () => onViewRelationship(project.id)
                    : null
                }
              />
            ) : null}
            <div className="project-card-actions">
              <Link
                className="project-report-control"
                href={
                  "/help/report-project/?project=" +
                  encodeURIComponent(project.id)
                }
                aria-label={["Report", displayName].join(" ")}
              >
                Report
              </Link>
              <span className="project-kit-control-hit">
                <ProjectKitControl
                  projectName={displayName}
                  bindings={bindings}
                />
              </span>
            </div>
            {bindings.state === "in-kit" ? (
              <span className="project-in-draft">In Kit</span>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
