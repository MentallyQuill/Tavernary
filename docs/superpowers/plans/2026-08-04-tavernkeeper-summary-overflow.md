# TavernKeeper Summary Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent internal TavernKeeper evidence identifiers from breaking the concise mobile scan popup.

**Architecture:** Add a display-only summary normalizer beside the popup component, leaving imported report data unchanged. Add a CSS containment guard for any future unbroken token.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, PostCSS

## Global Constraints

- Preserve exact raw TavernKeeper report data and full-report links.
- Preserve the seven-character visible scanned SHA and full-SHA accessible name.
- Do not change TavernKeeper report-site content or assessment risk semantics.

---

### Task 1: Sanitize concise assessment copy

**Files:**
- Modify: `src/features/catalog/components/tavernkeeper-scan-indicator.tsx`
- Test: `tests/unit/tavernkeeper-scan-indicator.test.tsx`

**Interfaces:**
- Consumes: `TavernKeeperReportSummary.summary: string`
- Produces: `conciseAssessmentSummary(summary: string): string`

- [ ] **Step 1: Write the failing component regression**

Add fixtures containing the live parenthetical finding-ID list and encoded
citation marker. Assert that the popup retains the human explanation but does
not render 64-character digests, citation markers, or a dangling incomplete
sentence.

- [ ] **Step 2: Verify the regression fails**

Run: `npm.cmd test -- tests/unit/tavernkeeper-scan-indicator.test.tsx`

Expected: FAIL because the popup currently renders `assessment.summary`
verbatim.

- [ ] **Step 3: Implement the minimal display normalizer**

Strip encoded citation spans and parenthetical finding-reference blocks,
collapse whitespace, and discard the final incomplete sentence only when an
artifact was removed. Use the normalized copy only in `stateCopy`.

- [ ] **Step 4: Verify the component regression passes**

Run: `npm.cmd test -- tests/unit/tavernkeeper-scan-indicator.test.tsx`

Expected: PASS.

### Task 2: Contain unforeseen long tokens

**Files:**
- Modify: `src/styles/catalog.css`
- Test: `tests/unit/tavernkeeper-scan-indicator.test.tsx`

**Interfaces:**
- Consumes: `.tavernkeeper-summary`
- Produces: mobile-safe wrapping through `overflow-wrap: anywhere`

- [ ] **Step 1: Write the failing style regression**

Parse `src/styles/catalog.css` and assert that `.tavernkeeper-summary` declares
`overflow-wrap: anywhere`.

- [ ] **Step 2: Verify the style regression fails**

Run: `npm.cmd test -- tests/unit/tavernkeeper-scan-indicator.test.tsx`

Expected: FAIL because the summary currently has no forced overflow wrapping.

- [ ] **Step 3: Add the minimal CSS guard**

Add a focused `.tavernkeeper-summary` rule with `overflow-wrap: anywhere`.

- [ ] **Step 4: Run focused and full verification**

Run: `npm.cmd test -- tests/unit/tavernkeeper-scan-indicator.test.tsx`

Run: `npm.cmd run check`

Expected: both commands exit successfully with zero failures.
