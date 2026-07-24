"use client";

import { useState } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import { CATEGORY_OPTIONS } from "../catalog-query";

function CategoryMark({ id }: { id: string }) {
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
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const current =
    CATEGORY_OPTIONS.find(({ id }) => id === selected) ?? CATEGORY_OPTIONS[0];

  return (
    <>
      <nav className="category-navigation" aria-label="Project categories">
        {CATEGORY_OPTIONS.map((category) => (
          <button
            className={selected === category.id ? "active" : ""}
            data-category={category.id || "all"}
            key={category.id || "all"}
            type="button"
            aria-pressed={selected === category.id}
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
          data-category={current.id || "all"}
        >
          <CategoryMark id={current.id} />
          <span>
            <small>Browse</small>
            {current.label}
          </span>
          <CategoryIcon name="chevron" />
        </button>
        {mobileOpen ? (
          <div className="mobile-category-menu">
            {CATEGORY_OPTIONS.map((category) => (
              <button
                key={category.id || "all"}
                type="button"
                className={selected === category.id ? "active" : ""}
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
