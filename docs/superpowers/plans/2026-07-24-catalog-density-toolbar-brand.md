# Catalog Density, Toolbar, and Brand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine Tavernary’s production catalog to match the approved search, filter, toolbar, compact-card, tooltip, submission-button, and three-gem brand contract.

**Architecture:** Keep one responsive catalog and one project-card renderer. Extend the existing query-driven density state with mockup-faithful CSS, keep capability overflow behavior inside the filter component, and preserve the existing portal tooltip system while replacing only its copy.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript 6, CSS, Vitest, Playwright.

## Global Constraints

- Preserve the outer search focus indicator while removing the native input-level outline and shadow.
- Capability chips show at most four wrapped rows until expanded; selected chips remain inside the visible rows.
- Remove the All, Active, New, and Released controls without breaking legacy `view` query parsing.
- Toolbar order is project count, compact toggle, then sort dropdown; the mobile filter button remains available.
- Compact cards hide summaries, aggregate community scores, repository sizes, and preset artifact sizes.
- Use concise factual tooltips and keep the accessible full-card description.
- Submit Project uses `#E18A24` fill and `#07181D` text.
- Copy `Tavernary-gems.png` without raster modification and keep raster imagery outside the CSS palette audit.
- Use only the approved CSS palette and the existing 30-day commit-freshness color interpolation.
- Node.js must satisfy `>=24 <25`.

---

### Task 1: Header focus, submission emphasis, and gem artwork

**Files:**
- Modify: `src/features/catalog/components/site-header.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/e2e/static-export.spec.ts`
- Create: `public/tavernary-gems.png`

**Interfaces:**
- Consumes: existing `SiteHeader` props and `.site-search`, `.submit-link`, `.brand-logo` selectors.
- Produces: static asset URL `./tavernary-gems.png`; one outer focus ring; orange-filled submission action.

- [ ] **Step 1: Write failing header contract tests**

Update the unit contract to require the new asset and palette treatment:

```ts
expect(header).toContain('src="./tavernary-gems.png"');
expect(header).not.toContain('src="./tavernary-logo.png"');
expect(css).toMatch(
  /\.site-search input\s*\{[^}]*outline:\s*0[^}]*box-shadow:\s*none/s,
);
expect(css).toMatch(
  /\.submit-link\s*\{[^}]*color:\s*var\(--color-page\)[^}]*background:\s*var\(--color-kind-extension\)/s,
);
```

Update the export test to request `tavernary-gems.png`. Add an E2E assertion that focuses the main search and compares the input and container styles:

```ts
const search = page.getByRole("searchbox", { name: "Search projects" });
await search.focus();
await expect(search).toHaveCSS("outline-style", "none");
await expect(search).toHaveCSS("box-shadow", "none");
await expect(page.locator(".site-search")).toHaveCSS(
  "border-top-color",
  "rgb(87, 197, 163)",
);
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:e2e -- --grep "search focus|desktop workspace"
```

Expected: FAIL because the header still references `tavernary-logo.png`, the input lacks the explicit focus reset, and the Submit Project button is not filled.

- [ ] **Step 3: Copy the approved raster and update the header**

Copy the supplied file byte-for-byte:

```powershell
Copy-Item -LiteralPath 'C:\Users\Keptin\Downloads\Tavernary-gems.png' -Destination 'F:\git\Tavernary\public\tavernary-gems.png'
```

Update the image reference and intrinsic ratio:

```tsx
<Image
  className="brand-logo"
  src="./tavernary-gems.png"
  alt=""
  width={573}
  height={515}
/>
```

Apply one input focus layer and the inverted submission action:

```css
.site-search input {
  outline: 0;
  box-shadow: none;
}

.header-actions .submit-link {
  border-color: var(--color-kind-extension);
  color: var(--color-page);
  background: var(--color-kind-extension);
}

.brand-logo {
  width: 52px;
  height: 47px;
  object-fit: contain;
  transform: none;
}
```

Use a proportionally smaller mobile size only if the 390px header geometry
test shows crowding.

- [ ] **Step 4: Run header, export, and palette checks**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:e2e -- --grep "search focus|desktop workspace"
npm.cmd run palette:audit
npm.cmd run build
npm.cmd run verify:export
```

Expected: all commands PASS and the exported gem asset returns HTTP 200.

- [ ] **Step 5: Commit**

```powershell
git add public/tavernary-gems.png src/features/catalog/components/site-header.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/visual-alignment-contract.test.ts tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts tests/e2e/static-export.spec.ts
git commit -m "feat: refine catalog header"
```

---

### Task 2: Four-row capability disclosure

**Files:**
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**
- Consumes: `FilterGroup` capability options and existing `onToggle(group, id)` callback.
- Produces: `.metadata-options.collapsed`, `Show more`, and `Show fewer`; selected capability options are ordered into the visible collapsed rows.

- [ ] **Step 1: Write failing capability disclosure tests**

Replace the capability-search assertions with:

```ts
await expect(
  page.getByRole("searchbox", {
    name: "Search capabilities and characteristics",
  }),
).toHaveCount(0);

const group = page.locator(".filter-panel").getByRole("group", {
  name: "Capabilities & characteristics",
});
const options = group.locator(".metadata-options");
const rows = await options.locator("label").evaluateAll((labels) =>
  new Set(labels.map((label) => Math.round(label.getBoundingClientRect().top)))
    .size,
);
expect(rows).toBeGreaterThan(4);
expect(
  await options.evaluate(
    (element) => element.scrollHeight > element.clientHeight,
  ),
).toBe(true);
await expect(group.getByRole("button", { name: "Show more" })).toBeVisible();
```

After expansion, select a capability from the final natural row, collapse the
group, and assert its bottom edge stays within the container:

```ts
await group.getByRole("button", { name: "Show more" }).click();
const selected = group.locator(".metadata-option").last();
await selected.getByRole("checkbox").check();
await group.getByRole("button", { name: "Show fewer" }).click();
expect(
  await selected.evaluate(
    (element) =>
      element.getBoundingClientRect().bottom <=
      element.parentElement!.getBoundingClientRect().bottom + 1,
  ),
).toBe(true);
```

- [ ] **Step 2: Run the capability tests and confirm RED**

Run:

```powershell
npm.cmd run test:e2e -- --grep "capabilit"
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because the capability search still renders and no four-row disclosure exists.

- [ ] **Step 3: Implement row-aware collapse**

Remove `capabilitySearch`, `setCapabilitySearch`, and the capability group’s
search props. In `FilterGroup`, add a chip-list ref, row-overflow state, and
resize measurement:

```tsx
const chipListRef = useRef<HTMLDivElement>(null);
const [chipsOverflow, setChipsOverflow] = useState(false);

useLayoutEffect(() => {
  if (presentation !== "chips" || !chipListRef.current) return;
  const list = chipListRef.current;
  const measure = () => {
    const rowCount = new Set(
      Array.from(list.children).map(
        (child) => Math.round((child as HTMLElement).offsetTop),
      ),
    ).size;
    setChipsOverflow(rowCount > 4);
  };
  const observer = new ResizeObserver(measure);
  observer.observe(list);
  measure();
  return () => observer.disconnect();
}, [presentation, options, selected, expanded]);
```

When collapsed, render selected capability options before unselected options
while preserving relative order within both groups:

```ts
const chipOptions = expanded
  ? options
  : [
      ...options.filter(({ id }) => selected.includes(id)),
      ...options.filter(({ id }) => !selected.includes(id)),
    ];
```

Add the chip disclosure control and fixed four-row geometry:

```css
.metadata-options.collapsed {
  max-height: calc(25px * 4 + 6px * 3);
  overflow: hidden;
}

.metadata-disclosure {
  /* reuse the quiet full-width disclosure treatment */
}
```

- [ ] **Step 4: Run desktop and mobile filter tests**

Run:

```powershell
npm.cmd run test:e2e -- --grep "capabilit|desktop filter|mobile filters"
npm.cmd run typecheck
```

Expected: PASS; the collapsed rail and mobile sheet each cap at four rows, and selected chips remain visible.

- [ ] **Step 5: Commit**

```powershell
git add src/features/catalog/components/filter-panel.tsx src/styles/catalog.css tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts tests/unit/visual-alignment-contract.test.ts
git commit -m "feat: collapse capability filters"
```

---

### Task 3: Simplified catalog toolbar

**Files:**
- Modify: `src/features/catalog/components/catalog-toolbar.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/visual/reference-alignment.spec.ts`
- Modify: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**
- Consumes: `CatalogQuery["sort"]`, `CatalogQuery["density"]`, mobile filter count.
- Produces: toolbar DOM order `.catalog-heading`, `.density-toggle`, `.sort-projects`; no `.view-tabs` and no `onView` prop.

- [ ] **Step 1: Write failing toolbar tests**

Replace view-tab geometry and interaction assertions with:

```ts
await expect(page.locator(".view-tabs")).toHaveCount(0);
await expect(
  page.getByRole("button", { name: "New", exact: true }),
).toHaveCount(0);

expect(
  await page.locator(".catalog-toolbar").evaluate((toolbar) =>
    Array.from(
      toolbar.querySelectorAll(
        "h1, .density-toggle, .sort-projects",
      ),
    ).map((element) =>
      element.matches("h1")
        ? "count"
        : element.classList.contains("density-toggle")
          ? "density"
          : "sort",
    ),
  ),
).toEqual(["count", "density", "sort"]);
```

On mobile, assert the filter button remains visible and the toolbar has no
horizontal overflow.

- [ ] **Step 2: Run toolbar tests and confirm RED**

Run:

```powershell
npm.cmd run test:e2e -- --grep "toolbar|density|breakpoints"
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because `.view-tabs` exists and the sort is in the separate controls group.

- [ ] **Step 3: Recompose the toolbar**

Remove `onView` from `CatalogToolbar` and its call site. Render the sort
immediately after the density toggle in the heading’s primary row:

```tsx
<div className="catalog-heading">
  <div className="catalog-primary-controls">
    <h1>{count} {count === 1 ? "project" : "projects"}</h1>
    <button className="density-toggle" /* existing props */>
      <CategoryIcon name="collapse" />
    </button>
    <select className="sort-projects" /* existing props */>
      {/* existing four sort options */}
    </select>
  </div>
  <p>Catalog refreshed {refreshedLabel}</p>
</div>
```

Keep `.catalog-controls` only for the mobile filter button, or render that
button as a direct toolbar sibling. Delete `.view-tabs` CSS and update mobile
grid/flex rules so the filter control and primary row fit at 390px.

- [ ] **Step 4: Run toolbar, query, and responsive tests**

Run:

```powershell
npm.cmd run test:e2e -- --grep "toolbar|sort|density|breakpoints"
npm.cmd run test:visual -- --grep "toolbar|catalog"
npm.cmd run typecheck
```

Expected: PASS; all four sort modes and density query restoration still work.

- [ ] **Step 5: Commit**

```powershell
git add src/features/catalog/components/catalog-toolbar.tsx src/features/catalog/components/catalog-page.tsx src/styles/catalog.css src/styles/responsive.css tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts tests/visual/reference-alignment.spec.ts tests/unit/visual-alignment-contract.test.ts
git commit -m "feat: simplify catalog toolbar"
```

---

### Task 4: Mockup-faithful compact cards and concise tooltips

**Files:**
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/visual/reference-alignment.spec.ts`

**Interfaces:**
- Consumes: existing `compact-cards` body class and portal `Tooltip`.
- Produces: concise tooltip labels; compact-only visibility and geometry through existing card selectors.

- [ ] **Step 1: Write failing compact and tooltip tests**

Add exact tooltip expectations:

```ts
await repositoryCard.locator(".card-identity").hover();
await expect(
  page.getByRole("tooltip", {
    name: "Generation & Reasoning Extension",
  }),
).toBeVisible();

await repositoryCard.locator(".activity-score").hover();
await expect(
  page.getByRole("tooltip", {
    name: /Active in \d+ of the last 12 weeks/,
  }),
).toBeVisible();
await expect(
  page.getByRole("tooltip", {
    name: /two-week commit totals/,
  }),
).toHaveCount(0);
```

After activating compact mode, assert:

```ts
await expect(card.locator(".card-summary-tooltip")).toBeHidden();
await expect(card.locator(".community")).toBeHidden();
await expect(card.locator(".repository-size")).toBeHidden();
await expect(card.locator(".activity-score")).toBeVisible();
await expect(card.locator(".commit-age")).toBeVisible();
expect((await card.boundingBox())!.height).toBeLessThan(174);
await expect(card.locator(".card-chips")).toHaveCSS("max-height", "18px");
```

Add the equivalent preset artifact-size assertion.

- [ ] **Step 2: Run card tests and confirm RED**

Run:

```powershell
npm.cmd run test:e2e -- --grep "compact|tooltip|card anatomy"
```

Expected: FAIL because compact cards retain summaries and repository facts and the current tooltips overexplain.

- [ ] **Step 3: Replace tooltip copy**

Use a small type-label helper:

```ts
function typeTooltip(primaryFunction: string, kind: string) {
  return `${primaryFunction} ${kind}`;
}
```

Use labels with no explanatory suffix:

```tsx
label={typeTooltip(primaryFunction, kindLabels[project.kind])}
label={`Active in ${project.activity.activeWeeks12} of the last 12 weeks`}
label={`Last commit ${formatDate(timestamp)} (${commitAge})`}
label={`${project.community.aggregate} total: ${project.community.stars} stars, ${project.community.forks} forks, ${project.community.subscribers} subscribers`}
label={repositorySize.replace(" repo", "")}
```

Keep chip descriptions and the complete visually hidden card description.

- [ ] **Step 4: Apply the approved compact CSS contract**

Replace the current compact overrides with the mockup geometry:

```css
.compact-cards .project-grid {
  align-items: start;
}

.compact-cards .project-card {
  height: auto;
  min-height: 0;
  padding: 11px 12px;
}

.compact-cards .card-top {
  min-height: 20px;
  align-items: center;
}

.compact-cards .function-symbol,
.compact-cards .function-symbol svg {
  width: 17px;
  height: 17px;
}

.compact-cards .development {
  display: flex;
  align-items: center;
  gap: 9px;
}

.compact-cards .community,
.compact-cards .repository-size,
.compact-cards .preset-size,
.compact-cards .card-summary-tooltip {
  display: none;
}

.compact-cards .project-card h2 {
  margin: 8px 0 10px;
  font-size: 15px;
}

.compact-cards .card-bottom {
  margin-top: 0;
  padding-top: 8px;
  align-items: center;
}

.compact-cards .card-chips {
  min-height: 18px;
  max-height: 18px;
  flex-wrap: nowrap;
  align-items: center;
}
```

- [ ] **Step 5: Run card, accessibility, mobile, and visual checks**

Run:

```powershell
npm.cmd run test:e2e -- --grep "compact|tooltip|card anatomy|activity facts"
npm.cmd run test:visual
npm.cmd run palette:audit
```

Expected: PASS; standard mobile cards retain repository facts, while compact
cards hide them at every breakpoint.

- [ ] **Step 6: Commit**

```powershell
git add src/features/catalog/components/project-card.tsx src/styles/catalog.css tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts tests/unit/visual-alignment-contract.test.ts tests/visual/reference-alignment.spec.ts
git commit -m "feat: tighten compact project cards"
```

---

### Task 5: Full regression and visual acceptance

**Files:**
- Modify if snapshots change intentionally: `tests/visual/reference-alignment.spec.ts-snapshots/*`
- Modify if documentation needs implementation notes: `docs/superpowers/specs/2026-07-24-catalog-density-toolbar-brand-design.md`

**Interfaces:**
- Consumes: Tasks 1–4 as one integrated catalog.
- Produces: verified static export and desktop/mobile visual evidence ready for integration.

- [ ] **Step 1: Run formatting and the full repository gate**

Run:

```powershell
npm.cmd run format
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
```

Expected: formatting completes; unit, catalog, type, build, export,  palette, E2E, and visual checks all PASS.

- [ ] **Step 2: Inspect desktop standard and compact renders**

Capture or update deterministic Playwright screenshots at 1440×1000. Compare
the live render to `docs/reference/mockups/catalog-wall-responsive-v7.html`,
checking:

- search has one focus boundary;
- title, density toggle, and sort order are correct;
- view tabs and capability search are absent;
- four capability rows and disclosure fit the rail;
- standard cards retain all facts;
- compact cards are content-height and omit the four specified facts;
- gem artwork and Submit Project emphasis match the approved header.

Only update snapshots after manually confirming each difference is intended.

- [ ] **Step 3: Inspect mobile standard and compact renders**

Capture at 390×844 and verify:

- brand artwork does not overlap the submission action;
- search, toolbar, sort, and filter button do not overflow;
- the filter sheet’s four-row capability disclosure works;
- standard cards retain activity/community/size facts;
- compact cards retain activity and commit age but hide summary/community/size;
- no tooltip is rendered on the mobile breakpoint.

- [ ] **Step 4: Re-run the gate after any visual adjustment**

Run:

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
git diff --check
```

Expected: all commands PASS and `git diff --check` reports no whitespace errors.

- [ ] **Step 5: Commit final snapshot or polish changes**

```powershell
git add src tests public docs
git commit -m "test: lock catalog density visuals"
```

Skip this commit if Task 5 produces no file changes.
