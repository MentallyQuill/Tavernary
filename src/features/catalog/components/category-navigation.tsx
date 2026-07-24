"use client";

import { useState } from "react";

import { CategoryIcon } from "@/components/icons/category-icon";
import { CATEGORY_OPTIONS } from "../catalog-query";

export function CategoryNavigation({
  selected,
  onSelect,
  counts,
}: {
  selected: string;
  onSelect: (id: string) => void;
  counts: Map<string, number>;
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
            key={category.id || "all"}
            type="button"
            aria-pressed={selected === category.id}
            onClick={() => onSelect(category.id)}
          >
            <CategoryIcon
              name={
                (category.id || "all") as Parameters<
                  typeof CategoryIcon
                >[0]["name"]
              }
            />
            <span>{category.shortLabel}</span>
            <b>{counts.get(category.id) ?? 0}</b>
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
        >
          <CategoryIcon
            name={
              (current.id || "all") as Parameters<
                typeof CategoryIcon
              >[0]["name"]
            }
          />
          <span>
            <small>Browse</small>
            {current.label}
          </span>
          <b>{counts.get(current.id) ?? 0}</b>
        </button>
        {mobileOpen ? (
          <div className="mobile-category-menu">
            {CATEGORY_OPTIONS.map((category) => (
              <button
                key={category.id || "all"}
                type="button"
                className={selected === category.id ? "active" : ""}
                onClick={() => {
                  onSelect(category.id);
                  setMobileOpen(false);
                }}
              >
                <CategoryIcon
                  name={
                    (category.id || "all") as Parameters<
                      typeof CategoryIcon
                    >[0]["name"]
                  }
                />
                <span>{category.label}</span>
                <b>{counts.get(category.id) ?? 0}</b>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
