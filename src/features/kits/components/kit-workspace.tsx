"use client";

import { useEffect, useRef, useState } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import { copyKitLink, kitShareUrl } from "@/features/kits/share-kit";
import type { CatalogKit } from "@/features/kits/kit-types";
import type { KitWorkspaceState } from "@/features/kits/use-kit-workspace";
import { KitProjectStack } from "./kit-project-stack";

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
}: {
  state: KitWorkspaceState;
  kit: CatalogKit | null;
  onCollapse: () => void;
  onDuplicate?: (kit: CatalogKit) => void;
  onEdit?: (kit: CatalogKit) => void;
}) {
  const [fallbackUrl, setFallbackUrl] = useState("");
  const fallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fallbackUrl) fallbackRef.current?.select();
  }, [fallbackUrl]);

  if (state.collapsed) {
    return (
      <aside
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
      id="kit-workspace"
      className="kit-workspace"
      aria-label="Kit workspace"
    >
      <header className="kit-workspace-header">
        <span>Kit workspace</span>
        <button
          type="button"
          aria-label="Collapse workspace"
          onClick={onCollapse}
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
      ) : (
        <div className="kit-workspace-intro">
          <h2>Kit draft</h2>
        </div>
      )}
    </aside>
  );
}
