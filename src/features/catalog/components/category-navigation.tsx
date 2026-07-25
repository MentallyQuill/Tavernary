"use client";

import { useState } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import { CATEGORY_OPTIONS } from "../catalog-query";

function CategoryMark({ id }: { id: string }) {
  if (id === "kits") {
    return <CategoryIcon name="kit" />;
  }
  if (!id) {
    return (
      <span className="all-symbol" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
    );
  }

  return (
    <CategoryIcon name={id as Parameters<typeof CategoryIcon>[0]["name"]} />
  );
}

export function CategoryNavigation({
  mode,
  selected,
  onSelect,
  onSelectKits,
}: {
  mode: "projects" | "kits";
  selected: string;
  onSelect: (id: string) => void;
  onSelectKits: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const current =
    CATEGORY_OPTIONS.find(({ id }) => id === selected) ?? CATEGORY_OPTIONS[0];

  return (
    <>
      <nav className="category-navigation" aria-label="Catalog categories">
        <button
          className={mode === "kits" ? "active" : ""}
          data-category="kits"
          type="button"
          aria-pressed={mode === "kits"}
          onClick={onSelectKits}
        >
          <CategoryMark id="kits" />
          <span>Kits</span>
        </button>
        {CATEGORY_OPTIONS.map((category) => (
          <button
            className={
              mode === "projects" && selected === category.id ? "active" : ""
            }
            data-category={category.id || "all"}
            key={category.id || "all"}
            type="button"
            aria-pressed={mode === "projects" && selected === category.id}
            onClick={() => onSelect(category.id)}
          >
            <CategoryMark id={category.id} />
            <span>{category.shortLabel}</span>
          </button>
        ))}
      </nav>

      <div className="mobile-category">
        <button
          className="mobile-category-trigger"
          type="button"
          aria-label="Browse categories"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          data-category={mode === "kits" ? "kits" : current.id || "all"}
        >
          <CategoryMark id={mode === "kits" ? "kits" : current.id} />
          <span>
            <small>Browse</small>
            {mode === "kits" ? "Kits" : current.label}
          </span>
          <CategoryIcon name="chevron" />
        </button>
        {mobileOpen ? (
          <div className="mobile-category-menu">
            <button
              type="button"
              className={mode === "kits" ? "active" : ""}
              data-category="kits"
              onClick={() => {
                onSelectKits();
                setMobileOpen(false);
              }}
            >
              <CategoryMark id="kits" />
              <span>Kits</span>
            </button>
            {CATEGORY_OPTIONS.map((category) => (
              <button
                key={category.id || "all"}
                type="button"
                className={
                  mode === "projects" && selected === category.id
                    ? "active"
                    : ""
                }
                data-category={category.id || "all"}
                onClick={() => {
                  onSelect(category.id);
                  setMobileOpen(false);
                }}
              >
                <CategoryMark id={category.id} />
                <span>{category.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
