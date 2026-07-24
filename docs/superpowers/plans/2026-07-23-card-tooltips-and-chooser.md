# Card Tooltips and Issue Chooser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the desktop category controls, explain every project-card fact through accessible tooltips, and safely reorder the GitHub issue chooser.

**Architecture:** Extend the existing vocabulary-to-generated-catalog pipeline with descriptions and keep the existing shared `Tooltip` as the only presentation primitive. Treat repository-owned issue forms as numerically ordered files while leaving GitHub's private security and maintainer-only blank entries under GitHub control.

**Tech Stack:** Next.js 16, React 19, TypeScript, JSON vocabularies, Vitest, Playwright, GitHub issue forms.

## Global Constraints

- Preserve the approved card geometry and existing visible labels.
- Make the last meaningful commit age bold.
- Do not create a public security-vulnerability issue form.
- Keep tooltip copy short, plain-language, and explanatory.
- Use test-first red-green-refactor cycles.

---

### Task 1: Center desktop category controls

**Files:**
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `src/styles/catalog.css`

**Interfaces:**
- Consumes: `.category-navigation button`
- Produces: centered icon-and-label button content without changing strip geometry

- [ ] **Step 1: Write failing unit and browser assertions**

Add a CSS contract assertion for `justify-content: center` and `text-align: center`, then add computed-style checks to the existing category-strip browser test.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm.cmd test -- tests/unit/visual-alignment-contract.test.ts --run`

Expected: FAIL because the category button has no centering declaration.

- [ ] **Step 3: Implement minimal CSS**

Add `justify-content: center` and change `text-align` to `center` in `.category-navigation button`.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- tests/unit/visual-alignment-contract.test.ts --run`

Expected: PASS.

Run: `npm.cmd run test:e2e -- --grep "approved category strip"`

Expected: PASS with centered computed styles and unchanged height/tracks.

### Task 2: Emit canonical metadata descriptions

**Files:**
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `data/vocabularies/frontends.json`
- Modify: `data/vocabularies/capabilities.json`
- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/catalog/catalog-types.ts`
- Regenerate: `src/generated/catalog.json`

**Interfaces:**
- Produces: `CatalogLabel { id: string; label: string; description: string }`
- Consumes: vocabulary entries with `id`, `label`, and `description`

- [ ] **Step 1: Write a failing catalog assertion**

Assert that every emitted frontend and capability has a non-empty `description`, and that SillyTavern's description is a known sentence.

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npm.cmd test -- tests/unit/build-catalog.test.ts --run`

Expected: FAIL because generated labels do not contain descriptions.

- [ ] **Step 3: Add descriptions and preserve them in the builder**

Add one concise description to every frontend and capability vocabulary entry. Change `labelsById` to map IDs to full entries and `labeled` to emit `{ id, label, description }`. Require `description: string` in `CatalogLabel`.

- [ ] **Step 4: Regenerate and verify**

Run: `npm.cmd run catalog:build`

Expected: `Built 5 projects`.

Run: `npm.cmd test -- tests/unit/build-catalog.test.ts --run`

Expected: PASS.

### Task 3: Explain every card fact

**Files:**
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css` only if the existing mobile suppression selector needs adjustment

**Interfaces:**
- Consumes: `CatalogLabel.description`, existing project activity/community/preset/license facts
- Produces: unique `aria-describedby` relationships and visible tooltip elements for all tile facts

- [ ] **Step 1: Write failing accessibility and style checks**

For a repository card, assert tooltip anchors for type, activity, commit age, community score, repository size, title, summary, every metadata chip, and license. Assert the commit-age computed font weight is at least `700`. For the preset card, assert version, publication/source status, and artifact-size tooltip anchors. Hover representative anchors and assert their tooltip text becomes visible.

- [ ] **Step 2: Run the focused browser test to verify failure**

Run: `npm.cmd run test:e2e -- --grep "explains every card fact"`

Expected: FAIL because multiple facts have no tooltip and commit age is not bold.

- [ ] **Step 3: Extend the shared tooltip alignment API**

Add an optional `align?: "left" | "right"` prop that appends `tooltip-align-left` or `tooltip-align-right` to the root class. Add matching CSS so left-side anchors position content with `left: 0; right: auto`.

- [ ] **Step 4: Wrap every card fact with explanatory copy**

Generate stable IDs from the project and fact IDs. Wrap type, activity, commit age, community, repository size, preset facts, title, summary, chips, and license. Use absolute commit dates in commit help, explain two-week activity bars, explain community aggregation, and source chip text from `CatalogLabel.description`.

- [ ] **Step 5: Make commit age visibly bold**

Set `.commit-age { font-weight: 700; }` without altering dormant coloring.

- [ ] **Step 6: Run focused browser verification**

Run: `npm.cmd run test:e2e -- --grep "explains every card fact"`

Expected: PASS.

### Task 4: Reorder and deduplicate the issue chooser

**Files:**
- Modify: `tests/unit/issue-forms.test.ts`
- Rename: `.github/ISSUE_TEMPLATE/project-submission.yml` to `.github/ISSUE_TEMPLATE/01-project-submission.yml`
- Rename: `.github/ISSUE_TEMPLATE/project-information.yml` to `.github/ISSUE_TEMPLATE/02-project-information.yml`
- Rename: `.github/ISSUE_TEMPLATE/website-bug.yml` to `.github/ISSUE_TEMPLATE/03-website-bug.yml`
- Rename: `.github/ISSUE_TEMPLATE/other.yml` to `.github/ISSUE_TEMPLATE/04-other.yml`
- Delete: `.github/ISSUE_TEMPLATE/help.yml`
- Modify: `.github/ISSUE_TEMPLATE/config.yml`

**Interfaces:**
- Produces: four repository-owned chooser entries in numeric order, no duplicate security link

- [ ] **Step 1: Write the failing exact chooser contract**

Assert the form filenames and names equal the four approved repository-owned entries in order. Assert `blank_issues_enabled` is `false`, `contact_links` is absent or empty, and no form is named Request help or Report a security vulnerability.

- [ ] **Step 2: Run the focused unit test to verify failure**

Run: `npm.cmd test -- tests/unit/issue-forms.test.ts --run`

Expected: FAIL with the old unordered filenames, Help form, and security contact link.

- [ ] **Step 3: Rename forms and remove duplicates**

Apply numeric prefixes, delete `help.yml`, and reduce `config.yml` to `blank_issues_enabled: false`.

- [ ] **Step 4: Update submission-form test paths**

Read the submission form from `01-project-submission.yml`.

- [ ] **Step 5: Run focused verification**

Run: `npm.cmd test -- tests/unit/issue-forms.test.ts --run`

Expected: PASS.

### Task 5: Full verification and visual examination

**Files:**
- Update visual snapshots only if the intentional centered category content changes pixels

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified deployable branch

- [ ] **Step 1: Run all static and unit checks**

Run: `npm.cmd run check`

Expected: exit 0 with no lint, type, build, or unit failures.

- [ ] **Step 2: Run the complete browser suite**

Run: `npm.cmd run test:e2e`

Expected: all tests pass.

- [ ] **Step 3: Run visual regression**

Run: `npm.cmd run test:visual`

Expected: all visual comparisons pass, or only the approved category-centering snapshot differs.

- [ ] **Step 4: Examine rendered screenshots**

Inspect desktop and mobile output against the two supplied screenshots and the approved mockup. Confirm category content centering, tooltip placement, unchanged card geometry, bold commit age, and no clipped text.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check`

Expected: exit 0.

Run: `git status --short`

Expected: only files named in this plan plus intentional visual snapshots.
