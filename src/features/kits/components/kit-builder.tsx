"use client";

import type { CatalogProject } from "@/features/catalog/catalog-types";
import {
  countWords,
  kitSetKey,
  validateKitDraft,
} from "@/features/kits/kit-domain.mjs";
import {
  moveProject,
  removeProject,
} from "@/features/kits/project-stack-order";
import type { KitDraft } from "@/features/kits/kit-types";
import { KitBuilderRow } from "./kit-builder-row";

export function KitBuilder({
  draft,
  projects,
  originalProjectIds,
  onUpdate,
  onSubmit,
}: {
  draft: KitDraft;
  projects: CatalogProject[];
  originalProjectIds: string[];
  onUpdate: (patch: Partial<KitDraft>) => void;
  onSubmit: () => void;
}) {
  const projectsById = new Map(
    projects.map((project) => [project.id, project]),
  );
  const validation = validateKitDraft(draft, projects);
  const duplicateUnchanged =
    originalProjectIds.length > 0 &&
    kitSetKey(originalProjectIds) === kitSetKey(draft.projectIds);
  const errors = [
    ...validation.errors,
    ...(duplicateUnchanged
      ? ["A duplicate must change the selected project set."]
      : []),
  ];

  return (
    <form
      className="kit-builder"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label>
        Title
        <input
          type="text"
          maxLength={60}
          value={draft.title}
          onChange={(event) => onUpdate({ title: event.target.value })}
        />
        <small>{draft.title.length}/60 characters</small>
      </label>
      <label>
        Description
        <textarea
          value={draft.description}
          onChange={(event) => onUpdate({ description: event.target.value })}
        />
        <small>{countWords(draft.description)}/100 words</small>
      </label>
      <ol className="kit-builder-stack">
        {draft.projectIds.map((projectId, index) => {
          const project = projectsById.get(projectId);
          return project ? (
            <KitBuilderRow
              key={projectId}
              project={project}
              index={index}
              count={draft.projectIds.length}
              onMove={(rowIndex, delta) =>
                onUpdate({
                  projectIds: moveProject(draft.projectIds, rowIndex, delta),
                })
              }
              onRemove={(id) =>
                onUpdate({
                  projectIds: removeProject(draft.projectIds, id),
                })
              }
            />
          ) : null;
        })}
      </ol>
      {errors.length > 0 ? (
        <ul className="kit-builder-errors" aria-label="Kit validation">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <button
        type="submit"
        disabled={errors.length > 0}
        aria-label="Submit Kit"
      >
        Submit Kit
      </button>
    </form>
  );
}
