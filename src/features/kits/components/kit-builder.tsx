"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { CatalogProject } from "@/features/catalog/catalog-types";
import {
  countWords,
  kitSetKey,
  validateKitDraft,
} from "@/features/kits/kit-domain.mjs";
import {
  insertProject,
  moveProject,
  removeProject,
} from "@/features/kits/project-stack-order";
import type { KitDraft } from "@/features/kits/kit-types";
import { useProjectStackDrag } from "@/features/kits/use-project-stack-drag";
import { useResponsiveCapabilities } from "@/hooks/use-responsive-capabilities";
import { KitBuilderRow } from "./kit-builder-row";

type RemovedProject = {
  projectId: string;
  projectName: string;
  index: number;
};

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
  const { touchLayout } = useResponsiveCapabilities();
  const formId = useId();
  const titleId = `${formId}-title`;
  const titleCountId = `${formId}-title-count`;
  const titleErrorId = `${formId}-title-error`;
  const descriptionId = `${formId}-description`;
  const descriptionCountId = `${formId}-description-count`;
  const descriptionErrorId = `${formId}-description-error`;
  const [touched, setTouched] = useState({
    title: false,
    description: false,
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [removedProject, setRemovedProject] = useState<RemovedProject | null>(
    null,
  );
  const removalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const stackRef = useRef<HTMLOListElement>(null);
  const drag = useProjectStackDrag({
    projectIds: draft.projectIds,
    onReorder: (projectIds) => onUpdate({ projectIds }),
    scrollContainerRef: stackRef,
  });
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
  const titleError = errors.find((error) => error.startsWith("Title must"));
  const descriptionError = errors.find((error) =>
    error.startsWith("Description must"),
  );
  const compositionErrors = errors.filter(
    (error) => error !== titleError && error !== descriptionError,
  );
  const showTitleError = Boolean(
    titleError && (touched.title || submitAttempted),
  );
  const showDescriptionError = Boolean(
    descriptionError && (touched.description || submitAttempted),
  );
  const visibleErrors = submitAttempted ? compositionErrors : [];

  const clearRemovalTimer = () => {
    if (removalTimerRef.current !== null) {
      clearTimeout(removalTimerRef.current);
      removalTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearRemovalTimer();
    },
    [],
  );

  const removeWithUndo = (
    projectId: string,
    projectName: string,
    index: number,
  ) => {
    clearRemovalTimer();
    setRemovedProject({ projectId, projectName, index });
    onUpdate({ projectIds: removeProject(draft.projectIds, projectId) });
    removalTimerRef.current = setTimeout(() => {
      setRemovedProject(null);
      removalTimerRef.current = null;
    }, 6000);
  };

  const undoRemoval = () => {
    if (!removedProject) return;
    clearRemovalTimer();
    onUpdate({
      projectIds: insertProject(
        draft.projectIds,
        removedProject.projectId,
        removedProject.index,
      ),
    });
    setRemovedProject(null);
  };

  return (
    <form
      className="kit-builder"
      onSubmit={(event) => {
        event.preventDefault();
        if (errors.length === 0) {
          onSubmit();
          return;
        }
        setSubmitAttempted(true);
        queueMicrotask(() => {
          if (titleError) {
            titleRef.current?.focus();
          } else if (descriptionError) {
            descriptionRef.current?.focus();
          }
        });
      }}
    >
      <div className="kit-builder-field">
        <label htmlFor={titleId}>Title</label>
        <input
          ref={titleRef}
          id={titleId}
          type="text"
          maxLength={60}
          value={draft.title}
          aria-describedby={[titleCountId, showTitleError ? titleErrorId : null]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={showTitleError || undefined}
          onChange={(event) => onUpdate({ title: event.target.value })}
          onBlur={() => setTouched((current) => ({ ...current, title: true }))}
        />
        <small id={titleCountId}>{draft.title.length}/60 characters</small>
        {showTitleError ? (
          <span id={titleErrorId} className="kit-builder-field-error">
            {titleError}
          </span>
        ) : null}
      </div>
      <div className="kit-builder-field">
        <label htmlFor={descriptionId}>Description</label>
        <textarea
          ref={descriptionRef}
          id={descriptionId}
          value={draft.description}
          aria-describedby={[
            descriptionCountId,
            showDescriptionError ? descriptionErrorId : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={showDescriptionError || undefined}
          onChange={(event) => onUpdate({ description: event.target.value })}
          onBlur={() =>
            setTouched((current) => ({ ...current, description: true }))
          }
        />
        <small id={descriptionCountId}>
          {countWords(draft.description)}/100 words
        </small>
        {showDescriptionError ? (
          <span id={descriptionErrorId} className="kit-builder-field-error">
            {descriptionError}
          </span>
        ) : null}
      </div>
      <ol ref={stackRef} className="kit-builder-stack">
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
              onRemove={(id) => removeWithUndo(id, project.name, index)}
              onDragStart={(event) => drag.begin(projectId, event)}
              dragging={drag.dragState?.projectId === projectId}
              placement={
                drag.dragState?.overProjectId === projectId
                  ? drag.dragState.placement
                  : null
              }
              touchLayout={touchLayout}
            />
          ) : null;
        })}
      </ol>
      {drag.dragState ? (
        <div className="kit-drag-ghost" aria-hidden="true">
          {projectsById.get(drag.dragState.projectId)?.name}
        </div>
      ) : null}
      {visibleErrors.length > 0 ? (
        <ul className="kit-builder-errors" aria-label="Kit validation">
          {visibleErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <footer className="kit-builder-footer">
        <span>{draft.projectIds.length} projects</span>
        {removedProject ? (
          <div className="kit-builder-undo" role="status" aria-live="assertive">
            Removed {removedProject.projectName}.
            <button
              type="button"
              aria-label={`Undo remove ${removedProject.projectName}`}
              onClick={undoRemoval}
            >
              Undo
            </button>
          </div>
        ) : null}
        <button type="submit" aria-label="Submit Kit">
          Submit Kit
        </button>
      </footer>
    </form>
  );
}
