"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import { copyKitLink, kitShareUrl } from "@/features/kits/share-kit";
import type { CatalogKit } from "@/features/kits/kit-types";
import type { KitBuilderState } from "@/features/kits/use-kit-builder";
import { useModalSurface } from "@/hooks/use-modal-surface";
import { useResponsiveCapabilities } from "@/hooks/use-responsive-capabilities";
import { useTransitionPresence } from "@/hooks/use-transition-presence";
import { KitProjectStack } from "./kit-project-stack";
import { KitBuilder } from "./kit-builder";
import { KitDraftAccess, type DraftAccessStatus } from "./kit-draft-access";

const builderBackground = [
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

export function KitBuilderPanel({
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
  draftAccessStatus,
  hidePhoneDraftAccess = false,
}: {
  state: KitBuilderState;
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
  draftAccessStatus?: DraftAccessStatus;
  hidePhoneDraftAccess?: boolean;
}) {
  const [fallbackUrl, setFallbackUrl] = useState("");
  const { phone } = useResponsiveCapabilities();
  const fallbackRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
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

  useEffect(() => {
    if (fallbackUrl) fallbackRef.current?.select();
  }, [fallbackUrl]);

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
  const openCollapsedBuilder = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      openerRef.current = activeElement;
    }
    onCollapse();
  };

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
          <button
            type="button"
            className="kit-builder-rail"
            aria-label="Open Kit Builder"
            onClick={openCollapsedBuilder}
          >
            <CategoryIcon name="kit-builder" />
            <span>Kit Builder</span>
          </button>
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
    >
      <header className="kit-builder-panel-header">
        <h2 ref={headingRef} tabIndex={-1}>
          Kit Builder
        </h2>
        <button
          type="button"
          className={`control-icon${phone ? "" : " kit-builder-collapse"}`}
          aria-label={phone ? "Close Kit Builder" : "Collapse Kit Builder"}
          onClick={() => {
            onCollapse();
          }}
        >
          <CategoryIcon name={phone ? "close" : "kit-builder"} />
        </button>
      </header>
      <div className="kit-builder-panel-body">
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
            <header>
              <h2>{kit.title}</h2>
              <p>@{kit.author.login}</p>
            </header>
            <p>{kit.description}</p>
            <div className="kit-builder-panel-actions">
              <button
                type="button"
                className="control-secondary"
                onClick={() => onDuplicate?.(kit)}
              >
                <CategoryIcon name="duplicate" />
                Duplicate
              </button>
              <button
                type="button"
                className="control-secondary"
                onClick={() => onEdit?.(kit)}
              >
                Edit
              </button>
              <button
                type="button"
                className="control-secondary"
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
              <a
                className="control-quiet"
                href={issueUrl("06-kit-report.yml", kit)}
                target="_blank"
              >
                Report Kit
              </a>
              <a
                className="control-quiet"
                href={issueUrl("07-kit-withdrawal.yml", kit)}
                target="_blank"
              >
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
          <div className="kit-builder-panel-build">
            <h2>
              {state.draft.operation === "edit" ? "Edit Kit" : "Create Kit"}
            </h2>
            <KitBuilder
              draft={state.draft}
              projects={projects}
              originalProjectIds={originalProjectIds}
              onUpdate={(patch) => onUpdateDraft?.(patch)}
              onSubmit={() => onSubmitDraft?.()}
            />
          </div>
        ) : (
          <div />
        )}
      </div>
    </aside>
  );
}
