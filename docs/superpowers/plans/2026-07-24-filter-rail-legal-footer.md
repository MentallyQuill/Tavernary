# Filter Rail Legal Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single muted legal line to the shared catalog filter surface: `Tavernary · AGPL-3.0-only`, with only the license label linked.

**Architecture:** Render the footer once in `FilterPanel` after the final filter group so desktop and mobile reuse the same markup. Add focused catalog CSS for muted, compact presentation and rely on existing responsive behavior.

**Tech Stack:** Next.js, React, TypeScript, CSS, Vitest.

## Global Constraints

- Keep the footer to one line of copy.
- Use the exact label `Tavernary · AGPL-3.0-only`.
- Link only `AGPL-3.0-only`; do not add About, Privacy, Terms, or copyright text.
- Reuse the existing muted color token and filter-panel spacing.

---

### Task 1: Add the footer contract test

**Files:**
- Modify: `tests/unit/visual-alignment-contract.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that reads the filter component and catalog stylesheet, then asserts the exact footer copy, license link, and muted footer class styling are present.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- --run tests/unit/visual-alignment-contract.test.ts`

Expected: FAIL because the footer markup and styles do not yet exist.

---

### Task 2: Render and style the footer

**Files:**
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/styles/catalog.css`

- [ ] **Step 1: Add the shared footer markup**

After the final `FilterGroup`, render:

```tsx
<div className="filter-legal">
  <span>Tavernary</span>
  <span aria-hidden="true">·</span>
  <a href="https://github.com/MentallyQuill/Tavernary/blob/main/LICENSE">
    AGPL-3.0-only
  </a>
</div>
```

- [ ] **Step 2: Add the muted one-line styling**

Style `.filter-legal` as a compact flex row using `var(--color-muted)`, with a top border and spacing that separates it from filter controls. Keep the link muted by default and underline it on hover/focus.

- [ ] **Step 3: Run the focused test**

Run: `npm test -- --run tests/unit/visual-alignment-contract.test.ts`

Expected: PASS.

---

### Task 3: Verify the catalog build and regression suite

**Files:**
- No additional files.

- [ ] **Step 1: Run the complete unit suite**

Run: `npm test -- --run`

Expected: PASS with zero failures.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint` and `npm run build`

Expected: Both commands exit with code 0.

