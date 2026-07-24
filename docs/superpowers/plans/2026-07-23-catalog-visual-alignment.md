# Catalog Visual Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production catalog visually match the preserved v7 mockup
while preserving the five-project data slice and all production behavior.

**Architecture:** Keep the current React component boundaries. Add
reference-backed source and browser contracts first, copy the preserved brand
asset into the deployable surface, then align header, navigation, filters,
cards, and responsive CSS in focused passes. Production data and query state
remain authoritative.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript, CSS, Vitest,
Testing Library, Playwright

## Global Constraints

- `docs/reference/mockups/catalog-wall-responsive-v7.html` remains immutable.
- Production must not import runtime code, styles, or assets from
  `docs/reference`.
- Preserve the five production records and all catalog query behavior.
- Preserve About, Help, Submit Project, and external project destinations.
- Preserve Recent Activity, Activity Strength, Popularity, and Alphabetical.
- Use the supplied Tavernary artwork from
  `docs/reference/assets/tavernary-logo.png`.
- Use the mockup's sans-serif typography throughout the catalog.
- Keep the 390-by-844 page free of horizontal overflow.
- Follow red-green-refactor for every behavior or visual-contract change.

---

### Task 1: Add Reference-Alignment Contracts and Deployable Artwork

**Files:**

- Create: `tests/unit/visual-alignment-contract.test.ts`
- Create: `public/tavernary-logo.png`
- Modify: `tests/e2e/static-export.spec.ts`

**Interfaces:**

- Consumes: immutable mockup and `docs/reference/assets/tavernary-logo.png`
- Produces: source-contract tests and deployable `./tavernary-logo.png`

- [ ] **Step 1: Write the failing source-contract test**

Create `tests/unit/visual-alignment-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("catalog visual alignment", () => {
  test("uses the supplied deployable logo in mockup order", () => {
    const header = read("src/features/catalog/components/site-header.tsx");
    expect(header).toContain('src="./tavernary-logo.png"');
    expect(header.indexOf("brand-copy")).toBeLessThan(
      header.indexOf("brand-logo"),
    );
    expect(header.indexOf("brand-logo")).toBeLessThan(
      header.indexOf("header-primary-actions"),
    );
  });

  test("uses reference card anatomy and sans typography", () => {
    const css = read("src/styles/catalog.css");
    expect(css).not.toContain('font-family: Georgia, "Times New Roman", serif');
    expect(css).not.toContain(".project-card::before");
    expect(css).toMatch(/\.card-bottom\s*\{[^}]*border-top:/s);
    expect(css).toMatch(/\.license\s*\{[^}]*border:\s*0/s);
  });

  test("keeps repository facts visible on mobile", () => {
    const responsive = read("src/styles/responsive.css");
    expect(responsive).not.toMatch(
      /\.community,\s*\n\s*\.repository-size\s*\{\s*display:\s*none/,
    );
  });

  test("restores reference filter vocabulary and controls", () => {
    const filters = read(
      "src/features/catalog/components/filter-panel.tsx",
    );
    expect(filters).toContain("Compatible frontend");
    expect(filters).toContain("Project kind");
    expect(filters).toContain("Capabilities & characteristics");
    expect(filters).toContain("Clear all");
    expect(filters).toContain("Search compatible frontends");
    expect(filters).toContain(
      "Search capabilities and characteristics",
    );
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because production still uses the generated feather, Georgia,
the left accent pseudo-element, hidden mobile repository facts, and condensed
filter vocabulary.

- [ ] **Step 3: Copy the approved binary asset**

Copy without modifying the reference:

```powershell
New-Item -ItemType Directory -Force public
Copy-Item -LiteralPath docs\reference\assets\tavernary-logo.png -Destination public\tavernary-logo.png
```

Extend `tests/e2e/static-export.spec.ts` with:

```ts
test("exports the supplied Tavernary artwork", async ({ page }) => {
  const response = await page.request.get(
    `${sitePath()}tavernary-logo.png`,
  );
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("image/png");
});
```

- [ ] **Step 4: Run the focused tests**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
```

Expected: the logo-export prerequisite exists, while the remaining source
contracts still fail for the intended reasons.

- [ ] **Step 5: Commit the contract and asset**

```powershell
git add tests/unit/visual-alignment-contract.test.ts tests/e2e/static-export.spec.ts public/tavernary-logo.png
git commit -m "test(ui): define mockup alignment contract"
```

### Task 2: Align Branding, Header, Categories, and Control Symbols

**Files:**

- Modify: `src/components/icons/category-icon.tsx`
- Modify: `src/features/catalog/catalog-query.ts`
- Modify: `src/features/catalog/components/site-header.tsx`
- Modify: `src/features/catalog/components/category-navigation.tsx`
- Modify: `src/features/catalog/components/catalog-toolbar.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**

- Consumes: `./tavernary-logo.png`, current query callbacks, current URLs
- Produces: mockup-ordered brand, secondary mobile actions, chevron chooser,
  `filter-lines` and `collapse` icons

- [ ] **Step 1: Add failing browser assertions**

Add to `tests/e2e/mobile.spec.ts`:

```ts
test("matches the approved mobile header hierarchy", async ({ page }) => {
  await page.goto(sitePath());
  const brand = page.getByRole("link", { name: "Tavernary home" });
  await expect(brand.locator(".brand-name")).toHaveCSS(
    "color",
    "rgb(225, 138, 36)",
  );
  await expect(brand.locator("img")).toHaveAttribute(
    "src",
    "./tavernary-logo.png",
  );
  await expect(page.locator(".header-primary-actions")).toContainText(
    "Submit Project",
  );
  await expect(page.locator(".header-secondary-actions")).toContainText(
    "About",
  );
  await expect(page.locator(".header-secondary-actions")).toContainText(
    "Help",
  );
  await expect(
    page.getByRole("button", { name: "Browse categories" }),
  ).toContainText("All Projects");
  await expect(
    page.getByRole("button", { name: "Browse categories" }).locator(
      '[data-icon="chevron"]',
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open filters" })).toContainText(
    "",
  );
});
```

Extend the existing overflow test:

```ts
const submit = page.getByRole("link", { name: "Submit Project" });
expect(await submit.evaluate((element) => element.clientHeight)).toBeLessThan(
  40,
);
```

- [ ] **Step 2: Run the mobile test and verify RED**

Run:

```powershell
npm.cmd run test:e2e -- tests/e2e/mobile.spec.ts
```

Expected: FAIL because the logo, action groups, chevron, and approved hierarchy
do not exist.

- [ ] **Step 3: Implement the approved header structure**

In `site-header.tsx`, use:

```tsx
<Link className="brand" href="/" aria-label="Tavernary home">
  <span className="brand-copy">
    <span className="brand-name">Tavernary</span>
    <span className="brand-tagline">Where AI roleplay tools gather</span>
  </span>
  <img
    className="brand-logo"
    src="./tavernary-logo.png"
    alt=""
    width="45"
    height="60"
  />
</Link>
<nav className="header-primary-actions" aria-label="Primary site actions">
  <a className="submit-link" href={submissionUrl}>Submit Project</a>
</nav>
<nav className="header-secondary-actions" aria-label="Secondary site actions">
  <a href="./about/">About</a>
  <a href={helpUrl}>Help</a>
</nav>
```

Keep the existing functional search input but restore:

```tsx
placeholder="Search projects, capabilities, frontends, or maintainers…"
```

- [ ] **Step 4: Implement reference control symbols**

Add `chevron`, `filter-lines`, and `collapse` to `IconName`.

Use these exact SVG bodies:

```tsx
if (name === "chevron") {
  return <svg {...common} {...props} data-icon="chevron"><path d="m7 9 5 5 5-5" /></svg>;
}
if (name === "filter-lines") {
  return <svg {...common} {...props} data-icon="filter-lines"><path d="M5 7h14M8 12h8m-5 5h2" /></svg>;
}
if (name === "collapse") {
  return <svg {...common} {...props} data-icon="collapse"><path d="m8 3-5 5m0-5 5 5m8-5 5 5m0-5-5 5M8 21l-5-5m0 5 5-5m8 5 5-5m0 5-5-5" /></svg>;
}
```

Replace the density-toggle spans with `<CategoryIcon name="collapse" />`, use
`filter-lines` for the mobile filter button, and end the mobile category
trigger with `<CategoryIcon name="chevron" />`.

- [ ] **Step 5: Restore category vocabulary**

Add this option after Frontends:

```ts
{ id: "preset", label: "System Presets", shortLabel: "System Presets" }
```

Change the character/worldbuilding short label to:

```ts
shortLabel: "Character & Worldbuilding"
```

Extend the `CatalogCategory` union and valid category set with `"preset"`.
Update the category selector so `"preset"` matches `project.kind ===
"preset"`; other categories continue matching `primaryFunction`.

- [ ] **Step 6: Align header and mobile CSS**

Port the mockup values:

```css
.catalog-shell {
  min-height: 100vh;
  background: var(--color-page);
}

.brand {
  gap: 6px;
}

.brand-name {
  color: var(--color-kind-extension);
  font-family: inherit;
  font-size: 29px;
  font-weight: 740;
  letter-spacing: -0.035em;
}

.brand-logo {
  width: 45px;
  height: 60px;
  object-fit: contain;
}
```

At `max-width: 760px`, use a three-row grid: brand and primary action, search,
then secondary actions. Keep Submit Project on one line, keep the tagline
visible, and size the header from its content rather than the old fixed
`126px`.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/catalog-selectors.test.ts tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:e2e -- tests/e2e/mobile.spec.ts
```

Expected: PASS with no horizontal overflow.

- [ ] **Step 8: Commit**

```powershell
git add src/components/icons/category-icon.tsx src/features/catalog/catalog-query.ts src/features/catalog/catalog-selectors.ts src/features/catalog/components/site-header.tsx src/features/catalog/components/category-navigation.tsx src/features/catalog/components/catalog-toolbar.tsx src/styles/catalog.css src/styles/responsive.css tests/e2e/mobile.spec.ts tests/unit/catalog-selectors.test.ts
git commit -m "fix(ui): align catalog header and controls"
```

### Task 3: Restore Filter Vocabulary, Search, and Clear-All Control

**Files:**

- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**

- Consumes: `clearFilters(): void`, existing `onToggle`
- Produces: facet-local search state and visible `Clear all`

- [ ] **Step 1: Add failing filter tests**

Add to `tests/e2e/catalog.spec.ts`:

```ts
test("uses the approved desktop filter controls", async ({ page }) => {
  await expect(page.getByText("Filters", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search compatible frontends" }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", {
      name: "Search capabilities and characteristics",
    }),
  ).toBeVisible();
  await expect(page.getByText("Project kind", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Capabilities & characteristics", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("searchbox", { name: "Search compatible frontends" })
    .fill("Marinara");
  await expect(page.getByLabel("Marinara Engine")).toBeVisible();
  await expect(page.getByLabel("SillyTavern")).toBeHidden();
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts
```

Expected: FAIL because the facet-search controls and approved headings do not
exist.

- [ ] **Step 3: Add local facet search**

Import `useState` in `filter-panel.tsx`. Add:

```ts
const [frontendSearch, setFrontendSearch] = useState("");
const [capabilitySearch, setCapabilitySearch] = useState("");
const matches = (label: string, search: string) =>
  label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
```

Extend `FilterGroup` with optional `search`, `onSearch`, and `searchLabel`.
Render the search input after the legend and filter `options` through
`matches`.

Use the approved headings and labels:

```tsx
<FilterGroup
  title="Compatible frontend"
  group="frontends"
  options={uniqueLabels(projects, "frontends")}
  selected={query.frontends}
  projects={projects}
  onToggle={onToggle}
  search={frontendSearch}
  onSearch={setFrontendSearch}
  searchLabel="Search compatible frontends"
/>
<FilterGroup
  title="Project kind"
  group="kinds"
  options={kindOptions}
  selected={query.kinds}
  projects={projects}
  onToggle={onToggle}
/>
<FilterGroup
  title="Capabilities & characteristics"
  group="capabilities"
  options={uniqueLabels(projects, "capabilities")}
  selected={query.capabilities}
  projects={projects}
  onToggle={onToggle}
  search={capabilitySearch}
  onSearch={setCapabilitySearch}
  searchLabel="Search capabilities and characteristics"
/>
```

- [ ] **Step 4: Add panel Clear all**

Add `onClear: () => void` to `FilterPanel` and render:

```tsx
<div className="filter-panel-title">
  <span>Filters</span>
  <button type="button" onClick={onClear}>Clear all</button>
</div>
```

Pass `clearFilters` to both desktop and mobile `FilterPanel` instances in
`catalog-page.tsx`.

- [ ] **Step 5: Align filter CSS**

Restore the mockup panel heading, facet-search height, restrained legend
spacing, and Clear all link treatment. Do not change checkbox query behavior.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/features/catalog/components/filter-panel.tsx src/features/catalog/components/catalog-page.tsx src/styles/catalog.css src/styles/responsive.css tests/e2e/catalog.spec.ts
git commit -m "fix(filters): restore mockup controls"
```

### Task 4: Align Card Anatomy and Responsive Facts

**Files:**

- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**

- Consumes: unchanged `ProjectCard` semantic markup
- Produces: flat reference card styling at desktop and mobile widths

- [ ] **Step 1: Add failing computed-style assertions**

Add a desktop card assertion:

```ts
test("uses the approved flat card anatomy", async ({ page }) => {
  const card = page.getByRole("link", { name: /Recursion/ });
  await expect(card.locator("h2")).toHaveCSS(
    "font-family",
    /Inter/,
  );
  await expect(card.locator(".card-bottom")).toHaveCSS(
    "border-top-style",
    "solid",
  );
  await expect(card.locator(".license")).toHaveCSS("border-top-width", "0px");
  expect(
    await card.evaluate((element) =>
      getComputedStyle(element, "::before").content,
    ),
  ).toBe("none");
});
```

Add a mobile assertion:

```ts
const cards = page.locator(".project-card");
expect(await cards.count()).toBe(5);
const firstCard = cards.first();
await expect(firstCard.locator(".community")).toBeVisible();
await expect(firstCard.locator(".repository-size")).toBeVisible();
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
```

Expected: FAIL on Georgia, missing divider, boxed license, pseudo-element, and
hidden mobile facts.

- [ ] **Step 3: Port card CSS**

Apply the mockup anatomy:

```css
.project-card {
  min-height: 248px;
  border: 1px solid var(--color-border);
  padding: 15px;
  background: var(--color-surface-card);
  transition: border-color 150ms ease;
}

.project-card:hover,
.project-card:focus-visible {
  border-color: var(--color-border-strong);
  box-shadow: none;
  transform: none;
}

.project-card h2 {
  margin: 14px 0 7px;
  font-family: inherit;
  font-size: 17px;
  font-weight: 720;
  line-height: 1.23;
}

.card-bottom {
  border-top: 1px solid var(--color-border);
  padding-top: 11px;
}

.license {
  min-height: 0;
  border: 0;
  padding: 0;
  color: var(--color-muted);
  background: transparent;
  font-size: 9px;
  font-weight: 400;
}
```

Delete `.project-card::before`. Retain kind color only on
`.function-symbol`. Restore the mockup's smaller chip dimensions.

At mobile width, remove the rule hiding `.community` and `.repository-size`.
Use the mockup's wrapping development layout so the facts fit without
overflow.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/styles/catalog.css src/styles/responsive.css tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
git commit -m "fix(cards): match reference anatomy"
```

### Task 5: Replace Self-Referential Visual Approval with Reference Evidence

**Files:**

- Create: `tests/visual/reference-alignment.spec.ts`
- Modify: `tests/visual/catalog.visual.spec.ts`
- Update:
  `tests/visual/catalog.visual.spec.ts-snapshots/catalog-desktop-win32.png`
- Update:
  `tests/visual/catalog.visual.spec.ts-snapshots/catalog-tablet-win32.png`
- Update:
  `tests/visual/catalog.visual.spec.ts-snapshots/catalog-mobile-win32.png`

**Interfaces:**

- Consumes: preserved mockup, production export, matched viewport sizes
- Produces: reference-derived computed-style contract plus reviewed production
  screenshots

- [ ] **Step 1: Write the failing reference comparison**

Create `tests/visual/reference-alignment.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { sitePath } from "../helpers/site-path";

test("production inherits the reference visual profile", async ({ page }) => {
  const reference = pathToFileURL(
    resolve(
      import.meta.dirname,
      "../../docs/reference/mockups/catalog-wall-responsive-v7.html",
    ),
  ).href;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(reference);
  const expected = await page.locator(".site-preview").evaluate(() => {
    const brand = getComputedStyle(document.querySelector(".brand-name")!);
    const card = getComputedStyle(document.querySelector(".repo-card")!);
    const title = getComputedStyle(document.querySelector(".card-title")!);
    const footer = getComputedStyle(document.querySelector(".card-bottom")!);
    return {
      brandColor: brand.color,
      brandFamily: brand.fontFamily,
      cardBackground: card.backgroundColor,
      titleFamily: title.fontFamily,
      footerBorder: footer.borderTopStyle,
    };
  });

  await page.goto(sitePath());
  const actual = await page.locator(".catalog-shell").evaluate(() => {
    const brand = getComputedStyle(document.querySelector(".brand-name")!);
    const card = getComputedStyle(document.querySelector(".project-card")!);
    const title = getComputedStyle(document.querySelector(".project-card h2")!);
    const footer = getComputedStyle(document.querySelector(".card-bottom")!);
    return {
      brandColor: brand.color,
      brandFamily: brand.fontFamily,
      cardBackground: card.backgroundColor,
      titleFamily: title.fontFamily,
      footerBorder: footer.borderTopStyle,
    };
  });

  expect(actual).toEqual(expected);
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
npm.cmd run test:visual -- tests/visual/reference-alignment.spec.ts
```

Expected: FAIL if any remaining branding, typography, card surface, or footer
contract differs.

- [ ] **Step 3: Correct only remaining reference mismatches**

Adjust the production CSS values named by the failing comparison. Do not change
production data or mockup source.

- [ ] **Step 4: Verify GREEN and review screenshots**

Run:

```powershell
npm.cmd run test:visual -- tests/visual/reference-alignment.spec.ts
npm.cmd run test:visual -- --update-snapshots
```

Inspect all three updated images side-by-side with the preserved mockup.
Approve them only when branding, card anatomy, desktop hierarchy, and mobile
hierarchy visibly match.

- [ ] **Step 5: Commit**

```powershell
git add tests/visual src/styles src/features/catalog src/components/icons public
git commit -m "test(ui): anchor visuals to reference"
```

### Task 6: Full Verification and Live Readiness

**Files:**

- Modify only files needed to correct failures discovered by this task

**Interfaces:**

- Consumes: completed Tasks 1-5
- Produces: release-ready alignment pass

- [ ] **Step 1: Run formatting**

Run:

```powershell
npm.cmd run format
```

- [ ] **Step 2: Run the complete gate**

Run:

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
```

Expected: all checks pass with no warnings or unexpected screenshot diffs.

- [ ] **Step 3: Inspect desktop and mobile exports**

Open the local production export and the preserved mockup at 1440 by 1000 and
390 by 844. Confirm:

- supplied artwork and orange sans wordmark;
- unwrapped mobile Submit Project;
- accessible About and Help;
- reference card anatomy and visible mobile repository facts;
- reference control symbols;
- no horizontal overflow;
- all five project links and catalog controls remain functional.

- [ ] **Step 4: Inspect the final diff**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: only scoped UI, tests, plan/spec, public artwork, and reviewed visual
baselines are changed.

- [ ] **Step 5: Commit final corrections if necessary**

```powershell
git add src/components/icons/category-icon.tsx src/features/catalog/catalog-query.ts src/features/catalog/catalog-selectors.ts src/features/catalog/components src/styles public tests
git commit -m "fix(ui): finish mockup alignment"
```

- [ ] **Step 6: Publish only after explicit release approval**

Push the verified feature branch and deploy through the existing GitHub Pages
workflow only when the user authorizes publication. After deployment, repeat
the desktop/mobile smoke check against the live URL.
