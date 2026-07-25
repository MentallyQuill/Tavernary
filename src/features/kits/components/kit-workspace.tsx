"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import { copyKitLink, kitShareUrl } from "@/features/kits/share-kit";
import type { CatalogKit } from "@/features/kits/kit-types";
import type { KitWorkspaceState } from "@/features/kits/use-kit-workspace";
import type { CatalogProjectDragState } from "@/features/kits/use-catalog-project-drag";
import { useModalSurface } from "@/hooks/use-modal-surface";
import { useResponsiveCapabilities } from "@/hooks/use-responsive-capabilities";
import { KitProjectStack } from "./kit-project-stack";
import { KitBuilder } from "./kit-builder";

const workspaceBackground = [
  ".site-header",
  ".category-navigation",
  ".mobile-category",
  ".catalog-layout > .filter-panel",
  ".catalog-main",
];

function issueUrl(template: string, kit: CatalogKit) {
  const url = new URL("https://github.com/MentallyQuill/Tavernary/issues/new");
  url.searchParams.set("template", template);
  url.searchParams.set("kit-id", kit.id);
  url.searchParams.set("share-url", kitShareUrl(kit.id));
  return url.toString();
}

export function KitWorkspace({
  state,
  kit,
  onCollapse,
  onDuplicate,
  onEdit,
  projects = [],
  originalProjectIds = [],
  onStartCreate,
  onUpdateDraft,
  onSubmitDraft,
  active = true,
  catalogDragState = null,
}: {
  state: KitWorkspaceState;
  kit: CatalogKit | null;
  onCollapse: () => void;
  onDuplicate?: (kit: CatalogKit) => void;
  onEdit?: (kit: CatalogKit) => void;
  projects?: CatalogProject[];
  originalProjectIds?: string[];
  onStartCreate?: () => void;
  onUpdateDraft?: (
    patch: Partial<import("@/features/kits/kit-types").KitDraft>,
  ) => void;
  onSubmitDraft?: () => void;
  active?: boolean;
  catalogDragState?: CatalogProjectDragState | null;
}) {
  const [fallbackUrl, setFallbackUrl] = useState("");
  const { phone, touchLayout } = useResponsiveCapabilities();
  const fallbackRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    if (fallbackUrl) fallbackRef.current?.select();
  }, [fallbackUrl]);

  const modalOpen =
    phone && active && !state.collapsed && state.mode !== "intro";

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
    inertSelectors: workspaceBackground,
    onDismiss: () => {
      onCollapse();
      returnFocus();
    },
  });

  if (phone && (!active || state.mode === "intro")) return null;

  if (state.collapsed) {
    if (touchLayout) {
      if (state.mode !== "build") return null;
      return (
        <aside
          ref={workspaceRef}
          id="kit-workspace"
          className="kit-draft-pill-container"
          aria-label="Kit draft"
        >
          <button
            type="button"
            className="kit-draft-pill"
            aria-label={`Open draft with ${state.draft.projectIds.length} projects`}
            onClick={(event) => {
              openerRef.current = event.currentTarget;
              onCollapse();
            }}
          >
            Draft <span aria-hidden="true">·</span>{" "}
            {state.draft.projectIds.length} projects
          </button>
        </aside>
      );
    }
    return (
      <aside
        ref={workspaceRef}
        id="kit-workspace"
        className="kit-workspace collapsed"
        aria-label="Kit workspace"
      >
        <button
          type="button"
          onClick={(event) => {
            openerRef.current = event.currentTarget;
            onCollapse();
          }}
        >
          Expand Kit workspace
        </button>
      </aside>
    );
  }

  return (
    <aside
      ref={workspaceRef}
      id="kit-workspace"
      className="kit-workspace"
      aria-label="Kit workspace"
      role={phone ? "dialog" : "complementary"}
      aria-modal={phone ? true : undefined}
    >
      <header className="kit-workspace-header">
        <h2 ref={headingRef} tabIndex={-1}>
          Kit workspace
        </h2>
        <button
          type="button"
          aria-label={phone ? "Close Kit workspace" : "Collapse workspace"}
          onClick={() => {
            onCollapse();
            if (phone) {
              returnFocus();
            }
          }}
        >
          <CategoryIcon name="collapse" />
        </button>
      </header>
      <div className="kit-workspace-body">
        {state.mode === "intro" ? (
          <div className="kit-workspace-intro">
            <h2>Build and inspect Kits</h2>
            <p>
              Select a Kit to inspect its ordered stack, or create a transient
              draft.
            </p>
            <button type="button" onClick={onStartCreate}>
              Create new Kit
            </button>
          </div>
        ) : state.mode === "inspect" && !kit ? (
          <div className="kit-workspace-intro">
            <h2>Unknown Kit</h2>
            <p>The selected Kit is no longer available in this catalog.</p>
          </div>
        ) : state.mode === "inspect" && kit ? (
          <div className="kit-workspace-inspect">
            <header>
              <h2>{kit.title}</h2>
              <p>@{kit.author.login}</p>
            </header>
            <p>{kit.description}</p>
            <div className="kit-workspace-actions">
              <button type="button" onClick={() => onDuplicate?.(kit)}>
                <CategoryIcon name="duplicate" />
                Duplicate
              </button>
              <button type="button" onClick={() => onEdit?.(kit)}>
                Edit
              </button>
              <button
                type="button"
                aria-label="Copy link"
                onClick={async () => {
                  const result = await copyKitLink(kit.id);
                  setFallbackUrl(
                    result === "fallback" ? kitShareUrl(kit.id) : "",
                  );
                }}
              >
                <CategoryIcon name="copy-link" />
                Copy link
              </button>
              <a href={issueUrl("06-kit-report.yml", kit)} target="_blank">
                Report Kit
              </a>
              <a href={issueUrl("07-kit-withdrawal.yml", kit)} target="_blank">
                Request withdrawal
              </a>
            </div>
            {fallbackUrl ? (
              <input
                ref={fallbackRef}
                aria-label="Kit link"
                readOnly
                value={fallbackUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
            ) : null}
            <KitProjectStack components={kit.components} />
          </div>
        ) : state.mode === "build" ? (
          <div className="kit-workspace-build">
            <h2>
              {state.draft.operation === "edit" ? "Edit Kit" : "Create Kit"}
            </h2>
            <KitBuilder
              draft={state.draft}
              projects={projects}
              originalProjectIds={originalProjectIds}
              onUpdate={(patch) => onUpdateDraft?.(patch)}
              onSubmit={() => onSubmitDraft?.()}
              catalogDragState={catalogDragState}
            />
          </div>
        ) : (
          <div />
        )}
      </div>
    </aside>
  );
}
