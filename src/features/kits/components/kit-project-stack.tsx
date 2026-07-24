"use client";

import { useState } from "react";

import type { CatalogKitComponent } from "@/features/kits/kit-types";

export function KitProjectStack({
  components,
}: {
  components: CatalogKitComponent[];
}) {
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    null,
  );

  return (
    <ol className="kit-project-stack">
      {components.map((component) => {
        const expanded = expandedProjectId === component.projectId;
        const flagged = component.availability === "flagged";
        return (
          <li key={component.projectId} className={flagged ? "flagged" : ""}>
            {flagged ? (
              <div className="kit-project-row">
                <span>
                  <strong>{component.name}</strong>
                  <small>{component.kind}</small>
                </span>
                <em>{component.unavailableReason}</em>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="kit-project-row"
                  aria-label={`${component.name} project details`}
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedProjectId(expanded ? null : component.projectId)
                  }
                >
                  <span>
                    <strong>{component.name}</strong>
                    <small>{component.kind}</small>
                  </span>
                  <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                </button>
                {expanded ? (
                  <div className="kit-project-details">
                    <p>
                      {component.project?.summary ??
                        `${component.name} is part of this Kit.`}
                    </p>
                    {component.canonicalUrl ? (
                      <a
                        href={component.canonicalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {component.name}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
