# Search Help Control Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten and center the search shortcut/help cluster without reducing mobile tap accessibility.

**Architecture:** Keep the existing DOM and popover behavior. Add browser-level geometry assertions first, then make the smallest CSS-only adjustment in the shared catalog styles.

**Tech Stack:** CSS, Playwright, Next.js, TypeScript

## Global Constraints

- The help trigger remains available on desktop and mobile.
- The question-mark SVG remains 18px and uses the supplied artwork.
- The coarse-pointer effective touch target remains 44px.

---

### Task 1: Tighten the Search Controls

**Files:**
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `src/styles/catalog.css`

**Interfaces:**
- Consumes: existing `.site-search`, `.search-help`, and `.search-help-trigger` selectors
- Produces: a 9px right inset, 6px slash/help gap, and centered 24px visible help surface

- [x] **Step 1: Write the failing browser geometry test**

Extend the existing main-search test to assert the approved literal geometry and icon center alignment from real browser bounding boxes.

- [x] **Step 2: Run the focused browser test to verify it fails**

Run: `npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts --grep "uses one focus boundary"`

Expected: FAIL because the current help trigger is 28px, the slash/help gap is 10px, and the right inset is 13px.

- [x] **Step 3: Implement the minimal CSS change**

Use asymmetric search padding, negative inline margins on `.search-help`, and a 24px square trigger with 3px padding. Increase the coarse-pointer pseudo-element inset to 10px so the effective target remains 44px.

- [x] **Step 4: Run focused and full verification**

Run the focused desktop test, relevant mobile/search-help tests, `npm.cmd run check`, and rendered desktop/mobile visual QA.

- [x] **Step 5: Commit and publish**

Commit the tested CSS and regression coverage, push `codex/tighten-search-help-controls`, open a ready PR, wait for required checks, and merge it.
