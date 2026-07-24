# Exact Catalog Mockup Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production catalog reproduce the complete visual and
responsive contract of
`docs/reference/mockups/catalog-wall-responsive-v7.html` while retaining the
production data, links, filtering, sorting, and accessibility behavior.

**Architecture:** Keep the existing React catalog state and query model.
Replace the invented presentation layer with the reference markup semantics,
exact SVG geometry, and exact CSS measurements. Expand reference-backed tests
from a small token sample to a selector/property matrix so a production
snapshot cannot silently redefine the target.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest, Playwright.

## Global Constraints

- The preserved v7 mockup is the visual authority.
- Production data, canonical links, sorting, filtering, URL state, and
  accessibility remain authoritative for behavior.
- Help remains available beside About even though it is a production-only
  addition.
- The five-project vertical slice remains the local fixture.
- Do not deploy this pass until the local desktop, tablet, and mobile renders
  have been inspected against the reference.
- No compatibility layer is required for the pre-alpha presentation markup.

---

### Task 1: Exact icon system and category-strip contract

**Files:**
- Modify: `src/components/icons/category-icon.tsx`
- Modify: `src/features/catalog/components/category-navigation.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: `CATEGORY_OPTIONS` ids and `CategoryIcon({ name })`.
- Produces: exact reference SVG geometry for every named category and control,
  plus the non-SVG four-cell `All Projects` mark.

- [ ] **Step 1: Add failing icon-geometry and category-layout contracts**

Add source assertions for the reference view boxes and paths:

```ts
expect(icons).toContain('viewBox="0 0 487.6 487.6"');
expect(icons).toContain('viewBox="0 0 512 512"');
expect(icons).toContain('viewBox="-16 0 512 512"');
expect(navigation).toContain('className="all-symbol"');
expect(css).toMatch(
  /\.category-navigation\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)/s,
);
expect(css).toMatch(
  /\.category-navigation button\.active\s*\{[^}]*border-color:[^}]*background:/s,
);
```

Add a browser assertion that the desktop category strip is 50px tall and the
active button has a solid border rather than an underline pseudo-element.

- [ ] **Step 2: Run the focused contracts and confirm RED**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:e2e -- --grep "approved category strip"
```

Expected: failures for the missing exact SVGs, missing all-symbol markup, and
the flex/underline category implementation.

- [ ] **Step 3: Port the exact mockup SVG symbols**

Replace the simplified paths with the complete symbol geometry from mockup
lines 1151-1181:

```tsx
const iconDefinitions = {
  frontend: {
    viewBox: "0 0 24 24",
    mode: "stroke",
    body: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 8h18M8 8v12M11 12h6M11 16h4" />
      </>
    ),
  },
  "interface-workflow": {
    viewBox: "0 0 24 24",
    mode: "stroke",
    body: (
      <>
        <path d="M4 6h5m4 0h7M4 12h10m4 0h2M4 18h2m4 0h10" />
        <circle cx="11" cy="6" r="2" />
        <circle cx="16" cy="12" r="2" />
        <circle cx="8" cy="18" r="2" />
      </>
    ),
  },
} as const;
```

Use the exact full preset, memory, generation, authoring, RPG, developer,
community, chevron, filter, and density definitions without simplifying path
data.

- [ ] **Step 4: Replace the All Projects SVG with the four-cell mark**

Render:

```tsx
<span className="all-symbol" aria-hidden="true">
  <i />
  <i />
  <i />
  <i />
</span>
```

in both desktop and mobile category controls.

- [ ] **Step 5: Port the category-strip CSS exactly**

Use:

```css
.category-navigation {
  min-height: 50px;
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  align-items: center;
  gap: 6px;
  overflow: hidden;
  padding: 6px 20px;
}

.category-navigation button {
  min-width: 0;
  width: 100%;
  height: 34px;
  justify-content: flex-start;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 5px 10px;
  font-size: 10px;
}

.category-navigation button.active {
  border-color: var(--color-border-strong);
  background: var(--color-surface-raised);
}
```

Delete the active underline pseudo-element.

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run build
npm.cmd run test:e2e -- --grep "approved category strip"
```

Expected: all focused tests pass.

Commit:

```powershell
git add src/components/icons/category-icon.tsx src/features/catalog/components/category-navigation.tsx src/styles/catalog.css tests/unit/visual-alignment-contract.test.ts tests/e2e/catalog.spec.ts
git commit -m "fix(nav): port exact mockup categories"
```

### Task 2: Desktop workspace, sidebar, and toolbar geometry

**Files:**
- Modify: `src/styles/catalog.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/visual/reference-alignment.spec.ts`

**Interfaces:**
- Consumes: existing `.catalog-layout`, `.filter-panel`, `.catalog-main`,
  `.catalog-toolbar`, `.catalog-controls`, `.view-tabs`, and `.sort-projects`.
- Produces: the reference workspace geometry without changing React state.

- [ ] **Step 1: Add failing computed-layout assertions**

Assert the following desktop values at 1440x1000:

```ts
expect(profile.workspace.gridTemplateColumns).toBe("238px 1fr");
expect(profile.workspace.columnGap).toBe("normal");
expect(profile.workspace.padding).toBe("0px");
expect(profile.sidebar.borderRadius).toBe("0px");
expect(profile.sidebar.padding).toBe("20px 18px 50px");
expect(profile.toolbar.minHeight).toBe("44px");
expect(profile.toolbar.alignItems).toBe("flex-start");
expect(profile.viewTabs.height).toBe("36px");
expect(profile.sort.height).toBe("36px");
```

- [ ] **Step 2: Run the reference test and confirm RED**

Run:

```powershell
npm.cmd run test:visual -- --grep "workspace and controls"
```

Expected: production reports the centered/padded 224px sidebar layout, 64px
toolbar, and mismatched control heights.

- [ ] **Step 3: Port the reference workspace**

Use:

```css
.catalog-layout {
  display: grid;
  grid-template-columns: 238px minmax(0, 1fr);
  min-height: calc(100vh - 116px);
  width: 100%;
  margin: 0;
  padding: 0;
  gap: 0;
}

.filter-panel {
  align-self: stretch;
  overflow: visible;
  border: 0;
  border-right: 1px solid var(--color-border);
  border-radius: 0;
  padding: 20px 18px 50px;
  background: var(--color-surface-primary);
}

.catalog-main {
  min-width: 0;
  padding: 20px 22px 60px;
}
```

- [ ] **Step 4: Port toolbar and equal-height controls**

Use the reference values:

```css
.catalog-toolbar {
  min-height: 44px;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 14px;
}

.catalog-controls {
  gap: 8px;
}

.view-tabs {
  height: 36px;
  padding: 3px;
  border-radius: 7px;
  overflow: visible;
}

.view-tabs button {
  height: 28px;
  border: 0;
  border-radius: 4px;
  padding: 7px 10px;
  font: 400 11px/1 inherit;
}

.sort-projects {
  height: 36px;
  border-radius: 7px;
  font: 400 11px/1 inherit;
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- --grep "workspace geometry|control heights"
npm.cmd run test:visual -- --grep "workspace and controls"
```

Expected: all pass.

Commit:

```powershell
git add src/styles/catalog.css tests/e2e/catalog.spec.ts tests/visual/reference-alignment.spec.ts
git commit -m "fix(layout): port exact desktop workspace"
```

### Task 3: Reference filter semantics and metadata chips

**Files:**
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**
- Consumes: the existing `onToggle(group, value)` query callback.
- Produces: standard rows for frontend/development/license, colored kind
  controls, and searchable wrapping capability chips.

- [ ] **Step 1: Add failing metadata-chip behavior tests**

Assert:

```ts
await expect(page.locator(".metadata-filter-chip")).toHaveCount(10);
await expect(page.locator(".metadata-options")).toHaveCSS("display", "flex");
await expect(page.locator(".metadata-filter-chip").first()).toHaveCSS(
  "border-radius",
  "999px",
);
```

After searching for `model`, assert only `Model routing` remains visible.
Click it and assert the chip is selected and the project grid is filtered.

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
npm.cmd run test:e2e -- --grep "metadata chips"
```

Expected: no `.metadata-filter-chip` elements exist.

- [ ] **Step 3: Add a dedicated metadata rendering variant**

Keep checkbox semantics but render visible chips:

```tsx
<div className="metadata-options">
  {visibleOptions.map((option) => {
    const isSelected = selected.includes(option.id);
    return (
      <label
        className={`metadata-option${isSelected ? " selected" : ""}`}
        key={option.id}
      >
        <span className="metadata-filter-chip">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle("capabilities", option.id)}
          />
          <span className="metadata-check" aria-hidden="true">✓</span>
          <span>{option.label}</span>
          <span className="metadata-count">
            {countFor(projects, "capabilities", option.id)}
          </span>
        </span>
      </label>
    );
  })}
</div>
```

- [ ] **Step 4: Port reference filter measurements**

Use mockup lines 302-497 exactly: 18px group padding, 28px standard options,
32px frontend search, 36px metadata search, 6px chip gap, 25px chip height,
999px radius, 9px chip type, and selected chips sorted before unselected ones.

- [ ] **Step 5: Port project-kind boxes**

Render the reference `.kind-box` after the visually hidden checkbox and set
`--kind-color` per kind. Preserve native labels and focus behavior.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- --grep "desktop filter controls|metadata chips"
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
```

Expected: all pass.

Commit:

```powershell
git add src/features/catalog/components/filter-panel.tsx src/styles/catalog.css tests/e2e/catalog.spec.ts tests/unit/visual-alignment-contract.test.ts
git commit -m "fix(filters): restore mockup metadata chips"
```

### Task 4: Card icon, typography, and internal spacing parity

**Files:**
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/visual/reference-alignment.spec.ts`

**Interfaces:**
- Consumes: exact `CategoryIcon` output from Task 1.
- Produces: bare 23px function icons, 48px card headers, and reference font
  metrics.

- [ ] **Step 1: Add failing card-internal assertions**

Assert:

```ts
expect(profile.cardTop.minHeight).toBe("48px");
expect(profile.functionSymbol.width).toBe("23px");
expect(profile.functionSymbol.height).toBe("23px");
expect(profile.functionSymbol.borderTopWidth).toBe("0px");
expect(profile.functionSymbol.borderRadius).toBe("0px");
expect(profile.functionIcon.width).toBe("23px");
expect(profile.kind.fontSize).toBe("9px");
expect(profile.summary.fontSize).toBe("11px");
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
npm.cmd run test:visual -- --grep "card internal geometry"
```

Expected: production reports a 31px header and a 14px icon inside a 25px
circle.

- [ ] **Step 3: Port card internals**

Use:

```css
.card-top {
  min-height: 48px;
}

.function-symbol {
  width: 23px;
  height: 23px;
  flex: none;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.function-symbol svg {
  width: 23px;
  height: 23px;
}

.card-identity {
  color: var(--color-text-secondary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1.3;
}
```

Copy all title, summary, development, chip, footer, and license measurements
from mockup lines 679-899 without local substitutions.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- --grep "approved card anatomy"
npm.cmd run test:visual -- --grep "card internal geometry"
```

Expected: all pass.

Commit:

```powershell
git add src/features/catalog/components/project-card.tsx src/styles/catalog.css tests/e2e/catalog.spec.ts tests/visual/reference-alignment.spec.ts
git commit -m "fix(cards): match mockup internal geometry"
```

### Task 5: Tablet and mobile parity

**Files:**
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/visual/reference-alignment.spec.ts`

**Interfaces:**
- Consumes: desktop structures from Tasks 1-4.
- Produces: the mockup's 1050px tablet grid and 760px mobile layout.

- [ ] **Step 1: Add failing responsive assertions**

At 1024px assert a 210px sidebar and an auto-fill card grid with a 240px
minimum. At 390px assert the reference category, toolbar, controls, filter
overlay, and 248px card measurements.

- [ ] **Step 2: Run responsive tests and confirm RED**

Run:

```powershell
npm.cmd run test:e2e -- --grep "tablet reference layout|mobile reference layout"
```

Expected: tablet fails because production forces one card column below 1180px.

- [ ] **Step 3: Replace invented breakpoints**

Use the reference boundaries:

```css
@media (min-width: 761px) and (max-width: 1050px) {
  .site-header {
    grid-template-columns: 175px minmax(260px, 1fr) auto auto;
  }

  .catalog-layout {
    grid-template-columns: 210px minmax(0, 1fr);
  }

  .project-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
}
```

Remove the current 1180px single-column rule. Port the reference mobile values
from lines 957-1124, adapting only the retained Help link into the approved
secondary row.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:visual -- --grep "reference layout"
```

Expected: all pass.

Commit:

```powershell
git add src/styles/responsive.css tests/e2e/mobile.spec.ts tests/visual/reference-alignment.spec.ts
git commit -m "fix(responsive): match mockup breakpoints"
```

### Task 6: Comprehensive reference gate and local visual handoff

**Files:**
- Modify: `tests/visual/reference-alignment.spec.ts`
- Modify: `tests/visual/catalog.visual.spec.ts`
- Update: `tests/visual/catalog.visual.spec.ts-snapshots/*.png`

**Interfaces:**
- Consumes: all production UI changes.
- Produces: a broad reference-derived regression gate and reviewable local
  desktop/tablet/mobile renders.

- [ ] **Step 1: Expand the reference profile**

Compare mapped selectors for:

```ts
const selectorMap = {
  header: [".topbar", ".site-header"],
  categoryStrip: [".category-strip", ".category-navigation"],
  category: [".category", ".category-navigation button"],
  workspace: [".workspace", ".catalog-layout"],
  filters: [".filters", ".filter-panel"],
  filterGroup: [".filter-group", ".filter-group"],
  toolbar: [".catalog-toolbar", ".catalog-toolbar"],
  controls: [".catalog-controls", ".catalog-controls"],
  viewTabs: [".view-tabs", ".view-tabs"],
  sort: [".sort", ".sort-projects"],
  grid: [".tile-grid", ".project-grid"],
  card: [".repo-card", ".project-card"],
  cardTop: [".card-top", ".card-top"],
  functionSymbol: [".function-symbol", ".function-symbol"],
  title: [".card-title", ".project-card h2"],
  summary: [".summary", ".card-summary"],
  footer: [".card-bottom", ".card-bottom"],
  chip: [".chip", ".chip"],
  license: [".license.missing", ".license-missing"],
};
```

For each selector, compare display, position, dimensions, grid/flex geometry,
margin, padding, border, radius, background, color, font family, font size,
font weight, line height, letter spacing, and text transform where applicable.

- [ ] **Step 2: Prove the gate detects structural drift**

Temporarily change one layout value, run the focused test, confirm it fails,
restore the value, and confirm it passes.

- [ ] **Step 3: Refresh and inspect screenshots**

Run:

```powershell
npm.cmd run test:visual -- --update-snapshots
```

Inspect all three PNGs. Do not accept a baseline that visibly differs from the
reference structure.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm.cmd run format
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
git diff --check
git status --short
```

Expected: zero errors, zero warnings, all tests pass, and only intentional
tracked changes remain.

- [ ] **Step 5: Present the local visual handoff**

Show the desktop, tablet, and mobile screenshots to the user and enumerate any
intentional production-only differences. Do not push or deploy before user
approval.
