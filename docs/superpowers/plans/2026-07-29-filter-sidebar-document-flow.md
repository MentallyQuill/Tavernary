# Filter Sidebar Document-Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the desktop Filters sidebar natural document-flow height without changing the persistent, internally scrollable Kit Builder.

**Architecture:** Keep the existing three-column catalog grid and make the desktop `.filter-panel` opt out of CSS Grid's default cross-axis stretching with `align-self: start`. Lock the distinction in both the static CSS contract and a browser regression that exercises an active empty-result filter state, restores the long catalog, and compares the document-flow Filters sidebar with the sticky Kit Builder.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, CSS Grid, Vitest, Playwright

## Global Constraints

- The desktop Filters sidebar has natural content height, no viewport-height cap, no sticky positioning, and no internal vertical scrollbar.
- The final filter group and `.filter-legal` footer remain fully reachable when filters are selected.
- The desktop Kit Builder keeps its current sticky positioning, viewport-bound height calculation, and internal scrollbar in collapsed, inspect, and build modes.
- The mobile Filter sheet and mobile Kit Builder remain unchanged.
- Do not change filter semantics, URL state, catalog result calculation, responsive breakpoints, or Kit Builder scroll restoration.
- Add no dependencies and do not update visual baselines for this focused layout correction.
- Preserve unrelated working-tree changes; execute in an isolated worktree created from the committed plan state.

---

## File Structure

- Modify `src/styles/catalog.css`: define the desktop Filters sidebar's cross-axis sizing contract.
- Modify `tests/unit/visual-alignment-contract.test.ts`: lock the CSS distinction between the natural-height Filters sidebar and viewport-bound Kit Builder.
- Modify `tests/e2e/catalog.spec.ts`: reproduce the selected-filter state and prove runtime document-flow behavior.

### Task 1: Separate Filters flow from the sticky Kit Builder

**Files:**
- Modify: `tests/unit/visual-alignment-contract.test.ts:330-350`
- Modify: `tests/e2e/catalog.spec.ts:175-220`
- Modify: `src/styles/catalog.css:430-437`

**Interfaces:**
- Consumes: Existing `.catalog-layout`, `.filter-panel`, `.filter-legal`, `.catalog-main`, `.kit-builder-panel`, and `FilterPanel` checkbox labels.
- Produces: A desktop `.filter-panel { align-self: start; }` layout contract. No TypeScript interface or component API changes.

- [ ] **Step 1: Add the failing static layout contract**

In `tests/unit/visual-alignment-contract.test.ts`, extend
`"uses the mockup desktop workspace and toolbar geometry"` with:

```ts
expect(css).toMatch(
  /\.filter-panel\s*\{[^}]*align-self:\s*start[^}]*padding:\s*20px 18px 50px[^}]*border-right:/s,
);
expect(css).toMatch(
  /\.kit-builder-panel\s*\{[^}]*position:\s*sticky[^}]*height:\s*var\(--kit-builder-visible-height,/s,
);
```

Replace the existing `.filter-panel` padding-only expectation so the test
requires one unambiguous desktop rule rather than duplicating assertions.

- [ ] **Step 2: Add the failing browser regression**

In `tests/e2e/catalog.spec.ts`, immediately after
`"uses the approved desktop workspace and matched toolbar controls"`, add:

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
    const footerBounds = footer.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      alignSelf: style.alignSelf,
      overflowY: style.overflowY,
      position: style.position,
      panelBottom: panelBounds.bottom,
      footerBottom: footerBounds.bottom,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });

  expect(selectedState).toMatchObject({
    alignSelf: "start",
    overflowY: "visible",
    position: "static",
  });
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
    const filtersPanel =
      document.querySelector<HTMLElement>(".filter-panel");
    const kitBuilder =
      document.querySelector<HTMLElement>(".kit-builder-panel");
    if (!filtersPanel || !kitBuilder) {
      throw new Error("Missing desktop sidebar");
    }
    const filterBounds = filtersPanel.getBoundingClientRect();
    const kitBounds = kitBuilder.getBoundingClientRect();
    return {
      filterBottom: filterBounds.bottom,
      kitPosition: getComputedStyle(kitBuilder).position,
      kitBottomGap: window.innerHeight - kitBounds.bottom,
    };
  });

  expect(scrolledState.filterBottom).toBeLessThan(0);
  expect(scrolledState.kitPosition).toBe("sticky");
  expect(scrolledState.kitBottomGap).toBeCloseTo(0, 0);
});
```

This single scenario covers the reported active-filter state, footer
reachability, absence of a nested Filters scrollbar, the long-catalog
document-flow boundary, and the unchanged sticky Kit Builder.

- [ ] **Step 3: Build the current export and verify RED**

Run:

```powershell
npm.cmd run build
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:e2e -- catalog.spec.ts --grep "lets desktop Filters end in page flow"
```

Expected:

- the unit test fails because `.filter-panel` does not declare
  `align-self: start`;
- the Playwright regression fails because the grid-stretched Filters sidebar
  reports `alignSelf: "stretch"` and continues through the long catalog row;
- existing build output completes so the browser failure reflects current
  source rather than a stale static export.

- [ ] **Step 4: Implement the smallest CSS change**

In the existing desktop `.filter-panel` rule in `src/styles/catalog.css`, add
`align-self: start` before the padding declaration:

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
`.kit-builder-panel`, `availableBuilderHeight`, or either mobile media query.

- [ ] **Step 5: Format and verify GREEN**

Run:

```powershell
npm.cmd exec prettier -- --write src/styles/catalog.css tests/unit/visual-alignment-contract.test.ts tests/e2e/catalog.spec.ts
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run build
npm.cmd run test:e2e -- catalog.spec.ts --grep "lets desktop Filters end in page flow"
```

Expected: formatting succeeds, the focused Vitest file passes, the static
export builds, and the new Playwright regression passes.

- [ ] **Step 6: Verify the unchanged desktop Kit Builder and mobile surfaces**

Run:

```powershell
npm.cmd run test:kits-e2e -- --grep "desktop Kit Builder stays flush|desktop long Kit stacks scroll"
npm.cmd run test:e2e -- mobile.spec.ts
```

Expected:

- the Kit Builder remains flush with the viewport after the header scrolls
  away;
- a long Kit still scrolls internally through its final row and submit
  controls;
- the mobile Filter sheet and Kit Builder coverage passes unchanged.

- [ ] **Step 7: Run the complete focused quality gate**

Run:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e -- catalog.spec.ts mobile.spec.ts
npm.cmd run test:kits-e2e
git diff --check
git status --short
```

Expected: every command passes. `git status --short` lists only
`src/styles/catalog.css`, `tests/unit/visual-alignment-contract.test.ts`, and
`tests/e2e/catalog.spec.ts` as implementation changes, plus this plan if it
was not committed before execution.

- [ ] **Step 8: Inspect the selected-filter layout**

Using the rebuilt static export at a `1440 × 900` viewport:

1. Select `Frontend` and `Chat Completion`.
2. Confirm the empty catalog state does not cover or clip `.filter-legal`.
3. Clear filters and scroll past the Filters sidebar.
4. Confirm the Filters sidebar leaves the viewport while the Kit Builder
   remains visible and its internal scrollbar still reaches all Kit cards.
5. Repeat at `900 × 900` to cover the tablet desktop layout.

Expected: the visual result matches the approved asymmetric behavior without
horizontal overflow, clipped footer content, or Kit Builder movement.

- [ ] **Step 9: Commit the implementation**

```powershell
git add -- src/styles/catalog.css tests/unit/visual-alignment-contract.test.ts tests/e2e/catalog.spec.ts
git commit -m "fix(catalog): stop filter sidebar stretch"
```

Expected: one focused implementation commit following the already committed
design and plan documentation.
