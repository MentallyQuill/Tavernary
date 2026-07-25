# Compact Card One-Line Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a muted, single-line project summary in compact cards at every
viewport while preserving the existing compact metadata hierarchy and desktop
full-summary tooltip.

**Architecture:** Keep the existing `ProjectCard` markup and accessible
description unchanged. Adjust only the compact CSS presentation, lock the
three-row contract with static and rendered tests, and refresh the two compact
visual baselines.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest, Playwright

## Global Constraints

- Standard cards remain unchanged.
- Compact cards use three rows: identity/activity, title, and muted summary.
- Compact titles and summaries are both single-line and ellipsized at every
  breakpoint.
- Compact state notes, frontend and capability chips, license, community
  score, repository size, and preset size remain hidden.
- The complete summary remains available from the project title on desktop
  pointer hover and keyboard focus.
- Mobile tooltip suppression remains unchanged.
- The card remains one external link; do not add nested controls,
  tap-to-expand, or two-tap navigation.
- Do not add dependencies or alter the approved production palette.
- Update the existing compact plan and behavior in place; no legacy compact
  variant is retained during pre-alpha.

---

## File Map

- `src/styles/catalog.css`: stop hiding `.card-summary` in compact mode and
  override its standard four-line geometry with a one-line compact treatment.
- `tests/unit/visual-alignment-contract.test.ts`: statically lock the compact
  hidden-content list and one-line summary CSS.
- `tests/e2e/catalog.spec.ts`: verify the desktop compact summary, preserved
  metadata hierarchy, ellipsis rules, density reduction, and full-summary
  title tooltip.
- `tests/e2e/mobile.spec.ts`: verify the same summary is visible at 390px while
  tooltips remain suppressed.
- `tests/visual/catalog.visual.spec.ts-snapshots/catalog-desktop-compact-win32.png`:
  approved desktop compact reference with three-row cards.
- `tests/visual/catalog.visual.spec.ts-snapshots/catalog-mobile-compact-win32.png`:
  approved mobile compact reference with three-row cards.

### Task 1: Render one-line summaries in compact cards

**Files:**

- Modify: `tests/unit/visual-alignment-contract.test.ts:91-99`
- Modify: `tests/e2e/catalog.spec.ts:554-595`
- Modify: `tests/e2e/mobile.spec.ts:108-112`
- Modify: `src/styles/catalog.css:1147-1167`

**Interfaces:**

- Consumes: the existing `.card-summary` element rendered by `ProjectCard`,
  the body-level `.compact-cards` class, and the existing project-title
  `Tooltip`.
- Produces: `.compact-cards .card-summary` as a visible block with
  `min-height: 0`, `overflow: hidden`, `text-overflow: ellipsis`, and
  `white-space: nowrap`.
- Preserves: the existing `.card-summary` color token and font treatment,
  title tooltip behavior, card accessible description, and hidden compact
  metadata.

- [ ] **Step 1: Write the failing static CSS contract**

In `tests/unit/visual-alignment-contract.test.ts`, replace the current compact
hide-selector assertion with the following two assertions:

```ts
expect(css).toMatch(
  /\.compact-cards \.community,[\s\S]*?\.compact-cards \.card-state-list,[\s\S]*?\.compact-cards \.card-bottom\s*\{[^}]*display:\s*none/s,
);
expect(css).toMatch(
  /\.compact-cards \.card-summary\s*\{[^}]*display:\s*block[^}]*min-height:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s,
);
```

Keep the existing compact title assertion immediately after these assertions.

- [ ] **Step 2: Write the failing desktop browser contract**

In `tests/e2e/catalog.spec.ts`, keep the existing
`substantially reduces cards in compact mode` test but capture the standard
height before switching density:

```ts
const standardHeight = (await repositoryCard.boundingBox())!.height;

await page.getByRole("button", { name: "Use compact cards" }).click();
```

Replace the hidden-summary assertion with:

```ts
const summary = repositoryCard.locator(".card-summary");
await expect(summary).toBeVisible();
await expect(summary).toHaveText(
  "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
);
await expect(summary).toHaveCSS("white-space", "nowrap");
await expect(summary).toHaveCSS("text-overflow", "ellipsis");
await expect(summary).toHaveCSS("overflow", "hidden");
await expect(summary).toHaveCSS("color", "rgb(203, 214, 211)");
```

Retain the current hidden-metadata and visible-title/activity assertions.
Replace the fixed `< 90` height check with:

```ts
const compactHeight = (await repositoryCard.boundingBox())!.height;
expect(compactHeight).toBeLessThan(standardHeight * 0.5);
```

Retain the final title-hover assertion proving that the complete summary is
still available through the desktop tooltip.

- [ ] **Step 3: Write the failing mobile browser contract**

Replace `does not render tile tooltips on mobile` in
`tests/e2e/mobile.spec.ts` with:

```ts
test("shows compact summaries without rendering mobile tooltips", async ({
  page,
}) => {
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Use compact cards" }).click();

  const card = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Recursion", exact: true }),
  });
  const summary = card.locator(".card-summary");

  await expect(summary).toBeVisible();
  await expect(summary).toHaveText(
    "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
  );
  await expect(summary).toHaveCSS("white-space", "nowrap");
  await expect(summary).toHaveCSS("text-overflow", "ellipsis");
  await expect(summary).toHaveCSS("overflow", "hidden");

  await card.locator(".card-title").hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});
```

- [ ] **Step 4: Run the focused tests to verify they fail**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run build
npm.cmd run test:e2e -- --grep "compact mode|compact summaries"
```

Expected:

- the unit test fails because `.card-summary` is still in the compact
  `display: none` selector and has no compact one-line rule;
- the desktop browser test fails because the compact summary is hidden; and
- the mobile browser test fails for the same reason.

- [ ] **Step 5: Implement the minimal compact CSS**

In `src/styles/catalog.css`, remove `.compact-cards .card-summary` from the
existing hidden-content selector. Immediately after that selector, add:

```css
.compact-cards .card-summary {
  display: block;
  min-height: 0;
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Do not add a viewport-specific override. The existing
`@media (max-width: 410px)` summary font size remains valid, and the base
`.card-summary` rule continues to supply the approved muted color.

- [ ] **Step 6: Run the focused tests to verify they pass**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run build
npm.cmd run test:e2e -- --grep "compact mode|compact summaries"
```

Expected: the static contract and both rendered compact-summary tests pass;
desktop title hover still shows the complete summary; mobile renders no
tooltip.

- [ ] **Step 7: Commit the tested behavior**

```powershell
git add -- src/styles/catalog.css tests/unit/visual-alignment-contract.test.ts tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
git commit -m "feat: show summaries in compact cards"
```

### Task 2: Refresh compact visual baselines and complete verification

**Files:**

- Modify: `tests/visual/catalog.visual.spec.ts-snapshots/catalog-desktop-compact-win32.png`
- Modify: `tests/visual/catalog.visual.spec.ts-snapshots/catalog-mobile-compact-win32.png`

**Interfaces:**

- Consumes: the completed three-row compact-card behavior from Task 1 and the
  existing `desktop compact catalog surface` and
  `mobile compact catalog surface` Playwright scenarios.
- Produces: reviewed desktop and mobile visual references plus a fully verified
  static export.

- [ ] **Step 1: Run the visual suite and confirm the expected failures**

Run:

```powershell
npm.cmd run test:visual
```

Expected: only the desktop and mobile compact catalog snapshots fail because
each compact card now includes a visible summary row.

- [ ] **Step 2: Regenerate only the compact snapshots**

Run:

```powershell
npm.cmd run test:visual -- --update-snapshots --grep "compact catalog surface"
```

Expected: only these files change:

```text
tests/visual/catalog.visual.spec.ts-snapshots/catalog-desktop-compact-win32.png
tests/visual/catalog.visual.spec.ts-snapshots/catalog-mobile-compact-win32.png
```

- [ ] **Step 3: Inspect both regenerated images**

Open both PNGs and confirm:

- every visible compact card has exactly three rows;
- summaries are muted, single-line, and ellipsized where necessary;
- titles remain visually stronger than summaries;
- type, activity, and recency facts remain aligned and unclipped;
- chips, licenses, community scores, repository sizes, preset sizes, and state
  notes remain absent;
- the mobile viewport has no horizontal overflow; and
- no colors outside the approved palette appear.

- [ ] **Step 4: Run the complete verification gate**

Run:

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
git diff --check
```

Expected:

- formatting, lint, palette audit, catalog validation/build, typecheck, unit
  tests, production build, and static-export verification pass;
- all browser and visual tests pass; and
- `git diff --check` reports no whitespace errors.

- [ ] **Step 5: Review scope before committing the visual references**

Run:

```powershell
git diff --stat HEAD~1
git diff HEAD~1 -- src/styles/catalog.css tests/unit/visual-alignment-contract.test.ts tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
git status --short
```

Expected: the implementation commit contains only compact summary CSS and
contracts, while the worktree contains only the two intended compact snapshot
updates.

- [ ] **Step 6: Commit the reviewed visual baselines**

```powershell
git add -- tests/visual/catalog.visual.spec.ts-snapshots/catalog-desktop-compact-win32.png tests/visual/catalog.visual.spec.ts-snapshots/catalog-mobile-compact-win32.png
git commit -m "test: update compact summary visuals"
```

- [ ] **Step 7: Run post-commit verification**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run test:visual
git status --short
```

Expected: all browser and visual tests pass, and the worktree is clean.
