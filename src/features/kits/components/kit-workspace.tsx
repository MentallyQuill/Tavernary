"use client";

import { useEffect, useRef, useState } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import type { CatalogProject } from "@/features/catalog/catalog-types";
import { copyKitLink, kitShareUrl } from "@/features/kits/share-kit";
import type { CatalogKit } from "@/features/kits/kit-types";
import type { KitWorkspaceState } from "@/features/kits/use-kit-workspace";
import { KitProjectStack } from "./kit-project-stack";
import { KitBuilder } from "./kit-builder";

function issueUrl(template: string, kit: CatalogKit) {
  const url = new URL("https://github.com/tavernary/tavernary/issues/new");
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
}) {
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [mobile, setMobile] = useState(false);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (fallbackUrl) fallbackRef.current?.select();
  }, [fallbackUrl]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobile || !active || state.collapsed) return;
    if (!workspaceRef.current?.contains(document.activeElement)) {
      openerRef.current = document.activeElement as HTMLElement;
    }
    document.body.classList.add("sheet-open");
    headingRef.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCollapse();
        window.setTimeout(() => openerRef.current?.focus(), 0);
        return;
      }
      if (event.key !== "Tab" || !workspaceRef.current) return;
      const focusable = Array.from(
        workspaceRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => {
      window.removeEventListener("keydown", trapFocus);
      document.body.classList.remove("sheet-open");
    };
  }, [active, mobile, onCollapse, state.collapsed]);

  useEffect(() => {
    if (mobile && state.collapsed) {
      window.setTimeout(
        () => workspaceRef.current?.querySelector("button")?.focus(),
        0,
      );
    }
  }, [mobile, state.collapsed]);

  if (mobile && !active) return null;

  if (state.collapsed) {
    return (
      <aside
        ref={workspaceRef}
        id="kit-workspace"
        className="kit-workspace collapsed"
        aria-label="Kit workspace"
      >
        <button type="button" onClick={onCollapse}>
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
      role={mobile ? "dialog" : "complementary"}
      aria-modal={mobile ? true : undefined}
    >
      <header className="kit-workspace-header">
        <h2 ref={headingRef} tabIndex={-1}>
          Kit workspace
        </h2>
        <button
          type="button"
          aria-label={mobile ? "Close Kit workspace" : "Collapse workspace"}
          onClick={() => {
            onCollapse();
            if (mobile) {
              window.setTimeout(() => openerRef.current?.focus(), 0);
            }
          }}
        >
          <CategoryIcon name="collapse" />
        </button>
      </header>
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
          />
        </div>
      ) : (
        <div />
      )}
    </aside>
  );
}
