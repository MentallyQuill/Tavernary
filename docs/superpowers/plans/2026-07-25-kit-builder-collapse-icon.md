# Kit Builder Collapse Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the expanded desktop Kit Builder collapse control to the collapsed rail's large yellow icon, flipped to point right.

**Architecture:** Keep the existing component markup and SVG. Add one focused browser regression test, then use a narrowly scoped CSS override so mobile behavior and unrelated header actions remain unchanged.

**Tech Stack:** Next.js, React, CSS, Playwright, Vitest

## Global Constraints

- Desktop collapse SVG is `26px` square and uses `var(--color-kind-extension)`.
- Desktop collapse SVG remains horizontally flipped.
- Desktop button target is `36px` square with transparent chrome.
- Mobile keeps its existing close icon.

---

### Task 1: Desktop Kit Builder collapse control

**Files:**
- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `src/styles/catalog.css`

**Interfaces:**
- Consumes: Existing `button[aria-label="Collapse Kit Builder"]`, `.kit-builder-collapse`, and `[data-icon="kit-builder"]`.
- Produces: A desktop collapse control whose computed icon and button styles match the approved contract.

- [ ] **Step 1: Write the failing test**

Add a Playwright test that opens the desktop catalog, locates the expanded Kit Builder collapse button and icon, then asserts a `36px` button, a `26px` yellow SVG, and a horizontal flip.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd run build:test-kits` and the focused Playwright test.

Expected: FAIL because the current header rule renders the icon at `16px` with muted color.

- [ ] **Step 3: Write minimal implementation**

Add a `.kit-builder-collapse` rule for the `36px` transparent control and extend `.kit-builder-collapse svg` with `26px` dimensions, `var(--color-kind-extension)`, and the existing `scaleX(-1)` transform.

- [ ] **Step 4: Run test to verify it passes**

Rebuild the Kits fixture and rerun the focused Playwright test.

Expected: PASS.

- [ ] **Step 5: Run regression verification**

Run the unit suite, full Kits browser suite, lint, typecheck, production build, and static-export verification.
