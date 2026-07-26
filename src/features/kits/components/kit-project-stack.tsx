import { CategoryIcon } from "@/components/icons/category-icon";
import { ProjectCard } from "@/features/catalog/components/project-card";
import type { CatalogKitComponent } from "@/features/kits/kit-types";

const kindLabels = {
  frontend: "Frontend",
  extension: "Extension",
  preset: "System Preset",
};

export function KitProjectStack({
  components,
  now,
}: {
  components: CatalogKitComponent[];
  now: string;
}) {
  return (
    <ol className="kit-project-stack" aria-label="Kit projects">
      {components.map((component) => {
        const project =
          component.availability === "available" &&
          component.project !== null &&
          component.canonicalUrl !== null
            ? {
                ...component.project,
                canonicalUrl: component.canonicalUrl,
              }
            : null;
        return (
          <li
            key={component.projectId}
            className={project ? undefined : "flagged"}
          >
            {project ? (
              <ProjectCard project={project} now={now} />
            ) : (
              <div
                className={`project-card kit-project-card-unavailable kind-${component.kind}`}
                role="group"
                aria-label={`${component.name} unavailable`}
                aria-disabled="true"
              >
                <div className="card-top">
                  <span className="card-identity">
                    <span className="function-symbol">
                      <CategoryIcon
                        name={
                          component.primaryFunction as Parameters<
                            typeof CategoryIcon
                          >[0]["name"]
                        }
                      />
                    </span>
                    <span>{kindLabels[component.kind]}</span>
                  </span>
                  <span className="development-unavailable">Unavailable</span>
                </div>
                <h2>{component.name}</h2>
                <p className="card-summary">
                  {component.unavailableReason ?? "Project unavailable"}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
