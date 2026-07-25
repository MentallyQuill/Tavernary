"use client";

import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { CatalogProject } from "@/features/catalog/catalog-types";
import {
  countWords,
  kitSetKey,
  validateKitDraft,
} from "@/features/kits/kit-domain.mjs";
import { removeProject } from "@/features/kits/project-stack-order";
import type { KitDraft } from "@/features/kits/kit-types";
import { splitKitProjectIds } from "@/features/kits/kit-project-layout";
import { useProjectStackDrag } from "@/features/kits/use-project-stack-drag";
import { useResponsiveCapabilities } from "@/hooks/use-responsive-capabilities";
import { KitFrontendSlot } from "./kit-frontend-slot";
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
  const { touchLayout } = useResponsiveCapabilities();
  const formId = useId();
  const titleId = `${formId}-title`;
  const titleCountId = `${formId}-title-count`;
  const titleErrorId = `${formId}-title-error`;
  const descriptionId = `${formId}-description`;
  const descriptionCountId = `${formId}-description-count`;
  const descriptionErrorId = `${formId}-description-error`;
  const frontendHeadingId = `${formId}-frontend-heading`;
  const [touched, setTouched] = useState({
    title: false,
    description: false,
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLFormElement>(null);
  const stackRef = useRef<HTMLOListElement>(null);
  const projectsById = new Map(
    projects.map((project) => [project.id, project]),
  );
  const { frontendId, stackProjectIds } = splitKitProjectIds(
    draft.projectIds,
    projects,
  );
  const removeImmediately = (projectId: string) => {
    const removedStackIndex = stackProjectIds.indexOf(projectId);
    onUpdate({ projectIds: removeProject(draft.projectIds, projectId) });
    queueMicrotask(() => {
      const rows = Array.from(
        stackRef.current?.querySelectorAll<HTMLElement>("[data-project-id]") ??
          [],
      );
      const targetRow =
        removedStackIndex >= 0
          ? rows[Math.min(removedStackIndex, rows.length - 1)]
          : rows[0];
      targetRow
        ?.querySelector<HTMLButtonElement>(".kit-builder-remove")
        ?.focus();
    });
  };
  const reorderFromKeyboard = (
    projectId: string,
    index: number,
    direction: -1 | 1,
  ) => {
    const targetIndex = Math.max(
      0,
      Math.min(stackProjectIds.length - 1, index + direction),
    );
    if (targetIndex === index) return;
    const nextStack = [...stackProjectIds];
    const [moved] = nextStack.splice(index, 1);
    nextStack.splice(targetIndex, 0, moved);
    onUpdate({
      projectIds: frontendId ? [frontendId, ...nextStack] : nextStack,
    });
    queueMicrotask(() => {
      const row = Array.from(
        stackRef.current?.querySelectorAll<HTMLElement>("[data-project-id]") ??
          [],
      ).find((candidate) => candidate.dataset.projectId === projectId);
      row?.querySelector<HTMLElement>(".kit-drag-handle")?.focus();
    });
  };
  const drag = useProjectStackDrag({
    projectIds: stackProjectIds,
    editorRef,
    stackRef,
    touchLayout,
    onReorder: (projectIds) =>
      onUpdate({
        projectIds: frontendId ? [frontendId, ...projectIds] : projectIds,
      }),
    onRemove: (projectId) => removeImmediately(projectId),
  });
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

  return (
    <form
      ref={editorRef}
      className="kit-builder"
      data-drag-intent={
        drag.dragState?.phase === "remove" ? "remove" : undefined
      }
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
      <section
        className="kit-frontend-foundation"
        aria-labelledby={frontendHeadingId}
      >
        <h3 id={frontendHeadingId}>Frontend</h3>
        <KitFrontendSlot
          project={frontendId ? (projectsById.get(frontendId) ?? null) : null}
          touchLayout={touchLayout}
          dragging={
            drag.dragState?.projectId === frontendId &&
            drag.dragState.phase === "remove"
          }
          onRemove={() => {
            if (frontendId) removeImmediately(frontendId);
          }}
          onDragStart={(event) => {
            if (frontendId) {
              drag.begin(frontendId, event, { reorderable: false });
            }
          }}
        />
      </section>
      <ol
        ref={stackRef}
        className="kit-builder-stack"
        aria-label="Ordered Kit projects"
      >
        {stackProjectIds.map((projectId, index) => {
          const project = projectsById.get(projectId);
          return project ? (
            <KitBuilderRow
              key={projectId}
              project={project}
              onRemove={removeImmediately}
              onDragStart={(event) =>
                drag.begin(projectId, event, { reorderable: true })
              }
              onDragKeyDown={(event) => {
                if (
                  !event.altKey ||
                  (event.key !== "ArrowUp" && event.key !== "ArrowDown")
                ) {
                  return;
                }
                event.preventDefault();
                reorderFromKeyboard(
                  projectId,
                  index,
                  event.key === "ArrowUp" ? -1 : 1,
                );
              }}
              dragging={
                drag.dragState?.projectId === projectId &&
                drag.dragState.phase !== "pressed"
              }
              placement={null}
              touchLayout={touchLayout}
            />
          ) : null;
        })}
      </ol>
      {drag.dragState && drag.dragState.phase !== "pressed"
        ? createPortal(
            <div
              className="kit-drag-ghost"
              aria-hidden="true"
              style={{
                width: drag.dragState.sourceRect?.width,
                height: drag.dragState.sourceRect?.height,
                transform: `translate3d(${drag.dragState.point.x}px, ${drag.dragState.point.y}px, 0)`,
              }}
            >
              {projectsById.get(drag.dragState.projectId)?.name}
              {drag.dragState.phase === "remove" ? (
                <span>Release to remove</span>
              ) : null}
            </div>,
            document.body,
          )
        : null}
      {visibleErrors.length > 0 ? (
        <ul className="kit-builder-errors" aria-label="Kit validation">
          {visibleErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <footer className="kit-builder-footer">
        <span>{draft.projectIds.length} projects</span>
        <button type="submit" aria-label="Submit Kit">
          Submit Kit
        </button>
      </footer>
    </form>
  );
}
