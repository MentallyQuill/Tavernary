"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import { CategoryIcon } from "@/components/icons/category-icon";
import { Tooltip } from "@/components/ui/tooltip";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import { kitShareUrl } from "@/features/kits/share-kit";
import type { CatalogKit } from "@/features/kits/kit-types";
import { useScrollBoundaries } from "@/features/kits/use-scroll-boundaries";
import type { KitBuilderState } from "@/features/kits/use-kit-builder";
import { useModalSurface } from "@/hooks/use-modal-surface";
import { useResponsiveCapabilities } from "@/hooks/use-responsive-capabilities";
import { useTransitionPresence } from "@/hooks/use-transition-presence";
import { KitProjectStack } from "./kit-project-stack";
import { KitBuilder } from "./kit-builder";
import { KitDiscardDialog } from "./kit-discard-dialog";
import { KitDraftAccess, type DraftAccessStatus } from "./kit-draft-access";
import { KitPreviewActionIcon } from "./kit-preview-action-icon";

const builderBackground = [
  ".site-header",
  ".category-navigation",
  ".mobile-category",
  ".catalog-layout > .filter-panel",
  ".catalog-main",
];

function withdrawalIssueUrl(kit: CatalogKit) {
  const url = new URL("https://github.com/MentallyQuill/Tavernary/issues/new");
  url.searchParams.set("template", "07-kit-withdrawal.yml");
  url.searchParams.set("kit-id", kit.id);
  url.searchParams.set("share-url", kitShareUrl(kit.id));
  return url.toString();
}

function formatProjectKindSummary(kit: CatalogKit) {
  const counts = kit.components.reduce(
    (summary, component) => {
      if (component.kind === "preset") summary.preset += 1;
      if (component.kind === "extension") summary.extension += 1;
      return summary;
    },
    { preset: 0, extension: 0 },
  );

  return [
    counts.preset > 0
      ? `${counts.preset} ${counts.preset === 1 ? "Preset" : "Presets"}`
      : null,
    counts.extension > 0
      ? `${counts.extension} ${
          counts.extension === 1 ? "Extension" : "Extensions"
        }`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function availableBuilderHeight(viewportHeight: number, top: number) {
  return Math.max(0, viewportHeight - Math.max(0, top));
}

export function KitBuilderPanel({
  state,
  kit,
  now,
  onCopyLink,
  onCollapse,
  onDuplicate,
  onEdit,
  projects = [],
  originalProjectIds = [],
  onStartCreate,
  onRevealFrontends,
  onUpdateDraft,
  onSubmitDraft,
  onDiscardDraft,
  omittedProjectCount = 0,
  active = true,
  draftAccessStatus,
  hidePhoneDraftAccess = false,
}: {
  state: KitBuilderState;
  kit: CatalogKit | null;
  now: string;
  onCopyLink: (kitId: string) => void | Promise<void>;
  onCollapse: () => void;
  onDuplicate?: (kit: CatalogKit) => void;
  onEdit?: (kit: CatalogKit) => void;
  projects?: CatalogProject[];
  originalProjectIds?: string[];
  onStartCreate?: () => void;
  onRevealFrontends: () => void;
  onUpdateDraft?: (
    patch: Partial<import("@/features/kits/kit-types").KitDraft>,
  ) => void;
  onSubmitDraft?: () => void;
  onDiscardDraft?: () => void;
  omittedProjectCount?: number;
  active?: boolean;
  draftAccessStatus?: DraftAccessStatus;
  hidePhoneDraftAccess?: boolean;
}) {
  const [discardOpen, setDiscardOpen] = useState(false);
  const { phone } = useResponsiveCapabilities();
  const workspaceRef = useRef<HTMLElement>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  const hadOpenPhoneSheetRef = useRef(false);
  const returnFocus = useCallback(() => {
    window.setTimeout(() => {
      const opener = openerRef.current;
      if (opener?.isConnected && opener.getClientRects().length > 0) {
        opener.focus();
      } else {
        workspaceRef.current?.querySelector("button")?.focus();
      }
    }, 0);
  }, []);

  const phoneSheetVisible =
    phone && active && !state.collapsed && state.mode !== "intro";
  const phonePresence = useTransitionPresence(phoneSheetVisible, 220);
  const modalOpen = phone && phonePresence.present && state.mode !== "intro";
  const resolvedDraftAccessStatus =
    state.mode === "build"
      ? (draftAccessStatus ?? {
          phase: "settled" as const,
          draftCount: state.draft.projectIds.length,
        })
      : null;
  const inspectScrollActive =
    !phone && state.mode === "inspect" && kit !== null;
  const scrollBoundaries = useScrollBoundaries(
    panelBodyRef,
    inspectScrollActive,
    `${state.mode}:${kit?.id ?? "none"}:${kit?.components.length ?? 0}`,
  );
  const openCollapsedBuilder = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      openerRef.current = activeElement;
    }
    onCollapse();
  };
  const closeDiscard = useCallback(() => {
    setDiscardOpen(false);
    window.setTimeout(() => discardRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (phoneSheetVisible) {
      hadOpenPhoneSheetRef.current = true;
    } else if (hadOpenPhoneSheetRef.current && !phonePresence.present) {
      hadOpenPhoneSheetRef.current = false;
      returnFocus();
    }
  }, [phonePresence.present, phoneSheetVisible, returnFocus]);

  useEffect(() => {
    if (!modalOpen) return;
    if (!workspaceRef.current?.contains(document.activeElement)) {
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement !== document.body) {
        openerRef.current = activeElement;
      }
    }
  }, [modalOpen]);

  useModalSurface({
    active: modalOpen,
    containerRef: workspaceRef,
    initialFocusRef: headingRef,
    inertSelectors: builderBackground,
    onDismiss: () => {
      onCollapse();
      returnFocus();
    },
  });

  useLayoutEffect(() => {
    if (phone) return;

    const workspace = workspaceRef.current;
    if (!workspace) return;

    let frame = 0;
    const updateVisibleHeight = () => {
      frame = 0;
      const height = availableBuilderHeight(
        window.innerHeight,
        workspace.getBoundingClientRect().top,
      );
      workspace.style.setProperty(
        "--kit-builder-visible-height",
        `${height}px`,
      );
    };
    const scheduleUpdate = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(updateVisibleHeight);
      }
    };

    updateVisibleHeight();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });

    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [phone, state.collapsed, state.mode]);

  if (
    phone &&
    !phonePresence.present &&
    !(state.collapsed && state.mode === "build")
  ) {
    return null;
  }

  if (state.collapsed && !(phone && phonePresence.present)) {
    if (phone) {
      if (state.mode !== "build" || hidePhoneDraftAccess) return null;
      return (
        <aside
          ref={workspaceRef}
          id="kit-builder-panel"
          className="kit-draft-pill-container"
          aria-label="Kit draft"
        >
          <KitDraftAccess
            variant="pill"
            status={resolvedDraftAccessStatus}
            onOpen={openCollapsedBuilder}
          />
        </aside>
      );
    }
    return (
      <aside
        ref={workspaceRef}
        id="kit-builder-panel"
        className="kit-builder-panel collapsed"
        aria-label="Kit Builder"
      >
        {state.mode === "build" ? (
          <KitDraftAccess
            variant="rail"
            status={resolvedDraftAccessStatus}
            onOpen={openCollapsedBuilder}
          />
        ) : (
          <div className="kit-builder-rail">
            <Tooltip
              id={`${tooltipId}-open-kit-builder-tooltip`}
              label="Open Kit Builder"
              className="control-tooltip"
            >
              <button
                type="button"
                className="kit-builder-toggle"
                aria-label="Open Kit Builder"
                onClick={openCollapsedBuilder}
              >
                <CategoryIcon name="kit-builder" />
              </button>
            </Tooltip>
            <span className="kit-builder-rail-label">Kit Builder</span>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      ref={workspaceRef}
      id="kit-builder-panel"
      className="kit-builder-panel"
      aria-label="Kit Builder"
      role={phone ? "dialog" : "complementary"}
      aria-modal={phone ? true : undefined}
      data-motion-phase={phone ? phonePresence.phase : undefined}
      data-mode={state.mode}
    >
      <header className="kit-builder-panel-header">
        <h2 ref={headingRef} tabIndex={-1}>
          Kit Builder
        </h2>
        {phone ? (
          <button
            type="button"
            className="control-icon kit-builder-toggle"
            aria-label="Close Kit Builder"
            onClick={onCollapse}
          >
            <CategoryIcon name="close" />
          </button>
        ) : (
          <Tooltip
            id={`${tooltipId}-collapse-kit-builder-tooltip`}
            label="Collapse Kit Builder"
            className="control-tooltip"
          >
            <button
              type="button"
              className="control-icon kit-builder-toggle kit-builder-collapse"
              aria-label="Collapse Kit Builder"
              onClick={onCollapse}
            >
              <CategoryIcon name="kit-builder" />
            </button>
          </Tooltip>
        )}
      </header>
      <div
        className="kit-builder-panel-body-frame"
        data-can-scroll-up={scrollBoundaries.canScrollUp ? "true" : undefined}
        data-can-scroll-down={
          scrollBoundaries.canScrollDown ? "true" : undefined
        }
      >
        <div ref={panelBodyRef} className="kit-builder-panel-body">
          {state.mode === "intro" ? (
            <div className="kit-builder-panel-intro">
              <h2>Build and inspect Kits</h2>
              <p>
                Select a Kit to inspect its ordered stack, or create a transient
                draft.
              </p>
              <button
                type="button"
                className="control-primary"
                onClick={onStartCreate}
              >
                Create new Kit
              </button>
            </div>
          ) : state.mode === "inspect" && !kit ? (
            <div className="kit-builder-panel-intro">
              <h2>Unknown Kit</h2>
              <p>The selected Kit is no longer available in this catalog.</p>
            </div>
          ) : state.mode === "inspect" && kit ? (
            <div className="kit-builder-panel-inspect">
              <div className="kit-builder-panel-inspect-header">
                <section
                  className="kit-builder-inspect-summary"
                  aria-labelledby={`${kit.id}-inspect-title`}
                >
                  {phone ? (
                    <header>
                      <h2 id={`${kit.id}-inspect-title`}>{kit.title}</h2>
                      <p>@{kit.author.login}</p>
                    </header>
                  ) : (
                    <header className="kit-builder-inspect-heading">
                      <CategoryIcon name="kit" />
                      <span className="kit-builder-inspect-identity">
                        <h2 id={`${kit.id}-inspect-title`}>{kit.title}</h2>
                        <small>@{kit.author.login}</small>
                      </span>
                    </header>
                  )}
                  <p className="kit-builder-inspect-description">
                    {kit.description}
                  </p>
                </section>
                <div className="kit-builder-panel-actions">
                  <div className="kit-builder-panel-primary-actions">
                    <button
                      type="button"
                      className="control-secondary kit-preview-action"
                      onClick={() => onDuplicate?.(kit)}
                    >
                      <KitPreviewActionIcon name="duplicate" />
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="control-secondary kit-preview-action"
                      onClick={() => onEdit?.(kit)}
                    >
                      Edit
                    </button>
                    <Tooltip
                      id={`${tooltipId}-copy-kit-link-tooltip`}
                      label="Copy a direct link to this Kit"
                      className="control-tooltip"
                    >
                      <button
                        type="button"
                        className="control-secondary kit-preview-action"
                        aria-label="Copy link"
                        onClick={() => void onCopyLink(kit.id)}
                      >
                        <KitPreviewActionIcon name="copy-link" />
                        Copy link
                      </button>
                    </Tooltip>
                  </div>
                  <div className="kit-builder-panel-admin-actions">
                    <Link
                      className="control-secondary kit-preview-action"
                      href={`/help/report-kit/?kit=${encodeURIComponent(kit.id)}`}
                    >
                      <KitPreviewActionIcon name="report" />
                      Report Kit
                    </Link>
                    <a
                      className="control-secondary kit-preview-action kit-withdrawal-action"
                      href={withdrawalIssueUrl(kit)}
                      target="_blank"
                    >
                      Request withdrawal
                    </a>
                  </div>
                </div>
              </div>
              <section
                className="kit-project-list"
                aria-labelledby={`${kit.id}-project-list-heading`}
              >
                <h3
                  id={`${kit.id}-project-list-heading`}
                  className="kit-project-list-heading"
                >
                  Projects
                </h3>
                <p className="kit-project-kind-summary">
                  {formatProjectKindSummary(kit)}
                </p>
                <KitProjectStack components={kit.components} now={now} />
              </section>
            </div>
          ) : state.mode === "build" ? (
            <div className="kit-builder-panel-build">
              <div className="kit-builder-panel-build-heading">
                <h2>
                  {state.draft.operation === "edit" ? "Edit Kit" : "Create Kit"}
                </h2>
                <Tooltip
                  id={`${tooltipId}-discard-draft-tooltip`}
                  label="Discard draft"
                  className="control-tooltip"
                >
                  <button
                    ref={discardRef}
                    type="button"
                    className="control-icon kit-discard-trigger"
                    aria-label="Discard draft"
                    onClick={() => setDiscardOpen(true)}
                  >
                    <CategoryIcon name="remove" />
                  </button>
                </Tooltip>
              </div>
              {omittedProjectCount > 0 ? (
                <p className="kit-draft-restore-notice" role="status">
                  {omittedProjectCount} saved{" "}
                  {omittedProjectCount === 1 ? "project is" : "projects are"} no
                  longer available and{" "}
                  {omittedProjectCount === 1 ? "was" : "were"} removed from this
                  draft.
                </p>
              ) : null}
              <KitBuilder
                draft={state.draft}
                projects={projects}
                originalProjectIds={originalProjectIds}
                onRevealFrontends={onRevealFrontends}
                onUpdate={(patch) => onUpdateDraft?.(patch)}
                onSubmit={() => onSubmitDraft?.()}
              />
            </div>
          ) : (
            <div />
          )}
        </div>
        {inspectScrollActive && scrollBoundaries.canScrollUp ? (
          <span
            className="kit-builder-scroll-fade kit-builder-scroll-fade-top"
            aria-hidden="true"
          />
        ) : null}
        {inspectScrollActive && scrollBoundaries.canScrollDown ? (
          <span
            className="kit-builder-scroll-fade kit-builder-scroll-fade-bottom"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {discardOpen && state.mode === "build" ? (
        <KitDiscardDialog
          onKeepEditing={closeDiscard}
          onDiscard={() => {
            setDiscardOpen(false);
            onDiscardDraft?.();
          }}
        />
      ) : null}
    </aside>
  );
}
