# Filter Sidebar Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the desktop Filters sidebar natural document-flow height, repair mobile Filter sheet clipping and scrollbar clearance, and preserve the persistent, internally scrollable Kit Builder.

**Architecture:** Keep the existing three-column desktop grid and opt `.filter-panel` out of CSS Grid cross-axis stretching with `align-self: start`. At the mobile breakpoint, size collapsed metadata from 44px touch rows and add 16px inline padding to filter groups. Runtime Playwright regressions protect both viewport behaviors.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, CSS Grid, Playwright

## Global Constraints

- The desktop Filters sidebar has natural content height, no viewport-height cap, no sticky positioning, and no internal vertical scrollbar.
- The desktop Kit Builder keeps its sticky positioning, viewport-bound height calculation, and internal scrollbar.
- The mobile Filter sheet keeps bounded modal scrolling and 44px touch targets.
- Mobile metadata chips fit inside a four-row collapsed region.
- Mobile filter labels and counts have at least 16px inline clearance from the scrollport.
- The mobile Kit Builder remains unchanged.
- Do not alter filter semantics, URL state, catalog result calculation, responsive breakpoints, or Kit Builder scroll restoration.
- Add no dependencies and do not update visual baselines.
- Preserve unrelated working-tree changes by executing in the isolated worktree.

---

## File Structure

- Modify `src/styles/catalog.css`: set the desktop Filters sidebar's cross-axis sizing.
- Modify `src/styles/responsive.css`: set mobile collapsed-row sizing and filter-group clearance.
- Modify `tests/e2e/catalog.spec.ts`: prove desktop document-flow behavior.
- Modify `tests/e2e/mobile.spec.ts`: prove mobile chip and count containment.

### Task 1: Repair mobile Filter sheet containment

**Files:**
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `src/styles/responsive.css`

**Interfaces:**
- Consumes: `.filter-sheet`, `.filter-group`, `.metadata-options.collapsed`, `.filter-choice-chip`, and `.filter-legal`.
- Produces: Four visible 44px metadata rows and 16px filter-group inline clearance at widths of 760px or less.

- [ ] **Step 1: Add the failing mobile regression**

Extend `"uses mobile browse and filter sheets without page overflow"` after
the dialog becomes visible:

```ts
const modelGroup = dialog.getByRole("group", { name: "Model family" });
const modelOptions = modelGroup.locator(".metadata-options");
const visibleModelChips = modelOptions.locator(".filter-choice-chip:visible");
const visibleModelChipCount = await visibleModelChips.count();
const modelContainment = await modelOptions.evaluate((element) => {
  const chips = Array.from(
    element.querySelectorAll<HTMLElement>(".filter-choice-chip"),
  ).filter((chip) => chip.getClientRects().length > 0);
  const bounds = element.getBoundingClientRect();
  return {
    bottom: bounds.bottom,
    chipBottoms: chips.map((chip) => chip.getBoundingClientRect().bottom),
  };
});
expect(visibleModelChipCount).toBeGreaterThan(0);
expect(Math.max(...modelContainment.chipBottoms)).toBeLessThanOrEqual(
  modelContainment.bottom + 1,
);

const development = dialog.getByRole("group", { name: "Development" });
const countClearances = await development.locator("b").evaluateAll((counts) => {
  const sheet = document.querySelector<HTMLElement>(".filter-sheet");
  if (!sheet) throw new Error("Missing Filter sheet");
  const scrollportRight = sheet.getBoundingClientRect().left + sheet.clientWidth;
  return counts.map(
    (count) => scrollportRight - count.getBoundingClientRect().right,
  );
});
expect(Math.min(...countClearances)).toBeGreaterThanOrEqual(16);
```

The production mutation caught is either restoring the 26px-based cap or
removing the mobile group padding.

- [ ] **Step 2: Run the mobile regression to verify RED**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- mobile.spec.ts --grep "uses mobile browse and filter sheets"
```

Expected: FAIL because a visible 44px model chip extends below the 122px
collapsed container and Development counts have approximately 0px scrollport
clearance.

- [ ] **Step 3: Implement the mobile CSS**

Inside `@media (max-width: 760px)` in `src/styles/responsive.css`, add:

```css
.filter-sheet .filter-group {
  padding-inline: 16px;
}

.filter-sheet .metadata-options.collapsed {
  max-height: calc(44px * 4 + 6px * 3);
}
```

Keep `.filter-sheet .filter-group label { min-height: 44px; }`, the sheet's
bounded overflow, and all mobile Kit Builder rules unchanged.

- [ ] **Step 4: Verify the mobile regression GREEN**

Run:

```powershell
npm.cmd exec prettier -- --write src/styles/responsive.css tests/e2e/mobile.spec.ts
npm.cmd run build
npm.cmd run test:e2e -- mobile.spec.ts --grep "uses mobile browse and filter sheets"
```

Expected: PASS with every visible chip inside the collapsed region and every
Development count at least 16px from the scrollport edge.

### Task 2: Stop the desktop Filters sidebar at its content

**Files:**
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `src/styles/catalog.css`

**Interfaces:**
- Consumes: `.catalog-layout`, `.filter-panel`, `.filter-legal`, and `.kit-builder-panel`.
- Produces: A natural-height desktop Filters column without changing Kit Builder behavior.

- [ ] **Step 1: Add the failing desktop regression**

After `"uses the approved desktop workspace and matched toolbar controls"` in
`tests/e2e/catalog.spec.ts`, add:

```ts
test("lets desktop Filters end in page flow while Kit Builder stays sticky", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const filters = page.locator(".filter-panel");
  await filters.getByLabel("Frontend", { exact: true }).check();
  await filters.getByLabel("Chat Completion", { exact: true }).check();
  await expect(page.locator(".project-card")).toHaveCount(0);

  const selectedState = await filters.evaluate((element) => {
    const footer = element.querySelector<HTMLElement>(".filter-legal");
    if (!footer) throw new Error("Missing Filters legal footer");
    const panelBounds = element.getBoundingClientRect();
    return {
      alignSelf: getComputedStyle(element).alignSelf,
      overflowY: getComputedStyle(element).overflowY,
      panelBottom: panelBounds.bottom,
      footerBottom: footer.getBoundingClientRect().bottom,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(selectedState.alignSelf).toBe("start");
  expect(selectedState.overflowY).toBe("visible");
  expect(selectedState.footerBottom).toBeLessThanOrEqual(
    selectedState.panelBottom + 1,
  );
  expect(selectedState.scrollHeight).toBeLessThanOrEqual(
    selectedState.clientHeight + 1,
  );

  await filters.getByRole("button", { name: "Clear all" }).click();
  await expect(page.locator(".project-card").first()).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const scrolledState = await page.evaluate(() => {
    const filterPanel = document.querySelector<HTMLElement>(".filter-panel");
    const kitBuilder = document.querySelector<HTMLElement>(
      ".kit-builder-panel",
    );
    if (!filterPanel || !kitBuilder) throw new Error("Missing desktop sidebar");
    return {
      filterBottom: filterPanel.getBoundingClientRect().bottom,
      kitPosition: getComputedStyle(kitBuilder).position,
      kitBottomGap:
        window.innerHeight - kitBuilder.getBoundingClientRect().bottom,
    };
  });
  expect(scrolledState.filterBottom).toBeLessThan(0);
  expect(scrolledState.kitPosition).toBe("sticky");
  expect(scrolledState.kitBottomGap).toBeCloseTo(0, 0);
});
```

- [ ] **Step 2: Run the desktop regression to verify RED**

Run:

```powershell
npm.cmd run test:e2e -- catalog.spec.ts --grep "lets desktop Filters end in page flow"
```

Expected: FAIL because the grid-stretched Filters sidebar reports
`alignSelf: "stretch"` and continues through the long catalog row.

- [ ] **Step 3: Implement the desktop CSS**

In `src/styles/catalog.css`:

```css
.filter-panel {
  align-self: start;
  padding: 20px 18px 50px;
  border: 0;
  border-right: 1px solid var(--color-divider);
  border-radius: 0;
  background: var(--color-bg-sidebar);
}
```

Do not add `position`, `height`, `max-height`, or `overflow-y`. Do not edit
`.kit-builder-panel` or `availableBuilderHeight`.

- [ ] **Step 4: Verify the desktop regression GREEN**

Run:

```powershell
npm.cmd exec prettier -- --write src/styles/catalog.css tests/e2e/catalog.spec.ts
npm.cmd run build
npm.cmd run test:e2e -- catalog.spec.ts --grep "lets desktop Filters end in page flow"
```

Expected: PASS.

### Task 3: Verify and commit the combined responsive correction

**Files:**
- Verify: `src/styles/catalog.css`
- Verify: `src/styles/responsive.css`
- Verify: `tests/e2e/catalog.spec.ts`
- Verify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: One verified responsive layout commit.

- [ ] **Step 1: Run focused preservation coverage**

```powershell
npm.cmd run test:kits-e2e -- --grep "desktop Kit Builder stays flush|desktop long Kit stacks scroll"
npm.cmd run test:e2e -- mobile.spec.ts
```

Expected: Kit Builder sticky/internal scrolling and all mobile coverage pass.

- [ ] **Step 2: Run the complete quality gate**

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e -- catalog.spec.ts mobile.spec.ts
npm.cmd run test:kits-e2e
git diff --check
git status --short
```

Expected: every command passes and only the two CSS files, two E2E files, and
approved documentation updates are modified.

- [ ] **Step 3: Inspect both responsive layouts**

At `390 × 844`, confirm model-family chips are whole and Development/License
counts clear the scrollbar. At `1440 × 900` and `900 × 900`, confirm Filters
leave the viewport after their content while Kit Builder stays pinned and
internally scrollable.

- [ ] **Step 4: Commit**

```powershell
git add -- docs/superpowers/specs/2026-07-29-filter-sidebar-document-flow-design.md docs/superpowers/plans/2026-07-29-filter-sidebar-document-flow.md src/styles/catalog.css src/styles/responsive.css tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
git commit -m "fix(catalog): repair filter layout"
```
