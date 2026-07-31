import type { CatalogProject } from "../catalog-types";
import type { ProjectSelectionBindings } from "@/features/kits/use-project-batch-selection";
import {
  SearchCorrection,
  SearchEmptyState,
  type SearchFeedback,
} from "@/features/search/components/search-empty-state";
import type { SearchEvidence } from "@/features/search/search-types";
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
  searchEvidenceById = new Map(),
  searchFeedback,
  relationshipChildId = "",
  onViewRelationship = () => undefined,
}: {
  projects: CatalogProject[];
  now: string;
  selection: {
    mode?: boolean;
    bindingsFor: (projectId: string) => ProjectSelectionBindings;
  };
  searchEvidenceById?: ReadonlyMap<string, SearchEvidence[]>;
  searchFeedback?: SearchFeedback;
  relationshipChildId?: string;
  onViewRelationship?: (childProjectId: string) => void;
}) {
  if (projects.length === 0) {
    return searchFeedback ? (
      <SearchEmptyState mode="projects" {...searchFeedback} />
    ) : (
      <SearchEmptyState
        mode="projects"
        query=""
        textMatchCount={0}
        activeFilterCount={0}
        correction={null}
        onUseCorrection={() => undefined}
      />
    );
  }

  return (
    <>
      {searchFeedback?.correction ? (
        <SearchCorrection
          correction={searchFeedback.correction}
          onUseCorrection={searchFeedback.onUseCorrection}
        />
      ) : null}
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
                searchEvidence={searchEvidenceById.get(project.id)}
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
              <span className="project-kit-control-hit">
                <ProjectKitControl
                  projectName={displayName}
                  bindings={bindings}
                />
              </span>
              {bindings.state === "in-kit" ? (
                <span className="project-in-draft">In Kit</span>
              ) : null}
            </div>
          );
        })}
      </section>
    </>
  );
}
