# Kit Builder Form-Control Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Kit Builder Title focus ring visible and make Description use the same typeface as Title.

**Architecture:** Preserve the current scroll ownership and focus-ring design. Add local inline clearance to the desktop scroll viewport and extend the global native-control font normalization to `textarea`.

**Tech Stack:** Next.js, React, CSS, Playwright

## Global Constraints

- Preserve the existing global focus-ring color, width, and offset.
- Preserve the existing mobile Kit Builder padding.
- Do not change Kit Builder form behavior or data.

---

### Task 1: Kit Builder form-control presentation

**Files:**
- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Existing `Create new Kit` action, `.kit-builder-panel-body`, and labeled Title and Description controls.
- Produces: A visible desktop Title focus ring and matching Title/Description `font-family` values.

- [ ] **Step 1: Write the failing regression test**

Add a Playwright test that opens the desktop Kit Builder, starts a new draft, focuses Title, and measures the input clearance from `.kit-builder-panel-body`. Assert at least four pixels on each inline edge and exact equality between the computed Title and Description font families.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build:test-kits; $env:PORT='3100'; node scripts/run-playwright.mjs --config playwright.kits.config.ts kits.spec.ts --grep "keeps form focus rings visible"`

Expected: FAIL because desktop inline clearance is zero.

- [ ] **Step 3: Implement the minimal CSS**

Add `textarea` to the global `font: inherit` selector. Add four pixels of inline padding to `.kit-builder-panel-body`; retain the existing mobile padding declaration. Size the fixed mobile panel with `100%` rather than `100vw` so reserved scrollbar width cannot push its right edge outside the visible document.

- [ ] **Step 4: Run focused and neighboring verification**

Run the focused Playwright test again, then run `npm run typecheck` and the relevant Kit Builder unit tests.

Expected: All commands exit successfully.

- [ ] **Step 5: Visually verify responsive behavior**

Inspect the focused Title and Description controls at desktop and mobile widths. Confirm the complete focus ring is visible and both controls use Inter without horizontal overflow.
