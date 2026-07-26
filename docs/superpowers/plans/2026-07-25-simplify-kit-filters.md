# Simplify Kit Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kits filterable only by compatible frontend, purpose, included project, size, and complete component availability, while removing the maintainer-curated Tavernary Pick concept.

**Architecture:** Remove unused component-derived and editorial fields at their source instead of hiding controls. Keep GitHub reaction support and Trending unchanged so discovery remains community-driven.

**Tech Stack:** TypeScript 6, React 19, Vitest, Playwright, JSON Schema, Node.js ESM.

## Global Constraints

- Preserve community support counts and Trending behavior.
- Preserve the final filters: Compatible frontend, Purpose, Includes project, Kit size, and All components available.
- Remove Kit creator, included project kind, capabilities, development, included project license, and Tavernary Pick from filter/query state.
- Remove Tavernary Pick from canonical Kit records, generated catalog data, cards, contribution scripts, and maintenance documentation.
- Do not touch unrelated submission-work changes in the primary checkout.

---

### Task 1: Query and filter surface

**Files:**
- Modify: `tests/unit/kit-query.test.ts`
- Modify: `tests/unit/kit-selectors.test.ts`
- Modify: `tests/unit/kit-filter-panel.test.tsx`
- Modify: `tests/unit/kit-active-query.test.tsx`
- Modify: `src/features/kits/kit-query.ts`
- Modify: `src/features/kits/kit-selectors.ts`
- Modify: `src/features/kits/components/kit-filter-panel.tsx`
- Modify: `src/features/catalog/catalog-query.ts`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/catalog/components/active-query.tsx`

**Interfaces:**
- Consumes: `KitQuery`, `selectKits`, `KitFilterPanel`
- Produces: a `KitQuery` containing only `frontends`, `purposes`, `includesProjectId`, `minProjects`, `maxProjects`, `allComponentsAvailable`, and `sort`

- [ ] **Step 1: Write one failing contract test**

Assert that Kit URL parsing, active tokens, and the filter panel no longer expose removed filters while the five retained controls remain.

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `npm.cmd test -- tests/unit/kit-query.test.ts tests/unit/kit-selectors.test.ts tests/unit/kit-filter-panel.test.tsx tests/unit/kit-active-query.test.tsx`

Expected: FAIL because removed fields and controls still exist.

- [ ] **Step 3: Remove obsolete query and UI behavior**

Delete obsolete fields from `KitQuery`, URL parsing/serialization, filter counting, active-token removal, and `KitFilterPanel`. Keep `allComponentsAvailable` as the sole Kit status checkbox.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run: `npm.cmd test -- tests/unit/kit-query.test.ts tests/unit/kit-selectors.test.ts tests/unit/kit-filter-panel.test.tsx tests/unit/kit-active-query.test.tsx`

Expected: PASS.

### Task 2: Tavernary Pick data contract

**Files:**
- Modify: `data/schemas/kit.schema.json`
- Modify: `scripts/kits/apply-submission.mjs`
- Modify: `scripts/kits/apply-submission.d.mts`
- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/kits/kit-types.ts`
- Modify: `src/features/kits/components/kit-card.tsx`
- Modify: `tests/fixtures/kits/records.json`
- Modify: affected unit fixtures and contract tests under `tests/unit`

**Interfaces:**
- Consumes: canonical Kit JSON and `CatalogKit`
- Produces: canonical and browser Kit records with no editorial-pick field

- [ ] **Step 1: Change one schema/build/card test to require no Pick field**

Assert the canonical schema does not require or define `tavernary_pick`, generated Kits omit `tavernaryPick`, and Kit cards do not render a Pick badge.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm.cmd test -- tests/unit/validate-kits.test.ts tests/unit/build-catalog.test.ts tests/unit/kit-card.test.tsx tests/unit/apply-kit-submission.test.ts tests/unit/apply-kit-withdrawal.test.ts`

Expected: FAIL because the field is still required and emitted.

- [ ] **Step 3: Remove the field across canonical and browser contracts**

Delete the field from JSON schema, submission defaults/types, build projection, browser type, fixtures, and card rendering.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run the same focused command and expect PASS.

### Task 3: Documentation and integrated proof

**Files:**
- Modify: `docs/contributing/kits.md`
- Modify: `docs/maintenance/kits.md`
- Modify: `docs/superpowers/specs/2026-07-24-kits-design.md`
- Modify: `docs/superpowers/specs/2026-07-25-kits-filter-unification-design.md`
- Modify: `tests/unit/kit-maintenance-docs.test.ts`
- Modify: `tests/kits-e2e/kits.spec.ts`

**Interfaces:**
- Consumes: final UI and data contract
- Produces: current documentation and browser proof matching the five-filter design

- [ ] **Step 1: Rewrite the maintenance-doc test and E2E assertions**

Assert that docs describe community support/Trending rather than maintainer Picks and that the browser exposes only the retained filter groups.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm.cmd test -- tests/unit/kit-maintenance-docs.test.ts`

Expected: FAIL against the old maintenance procedure.

- [ ] **Step 3: Update current documentation and E2E expectations**

Remove Pick policy text and obsolete filter references; preserve community support and safety-repair documentation.

- [ ] **Step 4: Run integrated verification**

Run:

```powershell
npm.cmd test
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
npm.cmd run check
```

Expected: all commands exit 0.
