# Catalog Filter, Aging, and Palette Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vocabulary-driven expandable frontend filter, exact mockup palette enforcement, semantic kind/status colors, viewport-safe tooltips, and the approved smaller inkwell geometry.

**Architecture:** Keep project metadata vocabulary-driven, isolate commit freshness in a pure utility, and centralize all floating help in a document-level tooltip portal. Add a production-source palette auditor to the normal repository gate so unauthorized authored colors cannot return.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS custom properties, Node.js 24, Vitest, Playwright.

## Global Constraints

- Production CSS and authored SVG/TSX color declarations may use only `#07181D`, `#0B2229`, `#102B33`, `#173740`, `#284A52`, `#3B6068`, `#F3F1E8`, `#CBD6D3`, `#849A9E`, `#D62839`, `#57C5A3`, and `#E18A24`.
- Raster images, browser font antialiasing, `transparent`, `currentColor`, and `inherit` are exempt.
- The commit-age mint-to-muted `color-mix` is the only generated color range.
- Top navigation labels remain near-white; their icons retain semantic kind colors.
- Tooltips must remain within an 8px viewport margin and must not depend on card overflow.
- Frontend filter order starts SillyTavern, Lumiverse, Marinara Engine.
- Use red-green-refactor for every behavior change.

---

### Task 1: Add the production palette auditor

**Files:**
- Create: `scripts/audit-palette.mjs`
- Create: `tests/unit/palette-audit.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `auditSource(path: string, source: string): PaletteViolation[]`
- Produces: `auditProductionPalette(root?: string): Promise<PaletteViolation[]>`
- Produces: npm script `palette:audit`

- [ ] **Step 1: Write failing unit tests for accepted and rejected color syntax**

Create `tests/unit/palette-audit.test.ts`:

```ts
import { expect, test } from "vitest";

import {
  APPROVED_HEX,
  auditSource,
} from "../../scripts/audit-palette.mjs";

test("accepts the exact production palette and neutral keywords", () => {
  const source = [
    ...APPROVED_HEX.map((color) => `.x{color:${color}}`),
    ".x{color:transparent;fill:currentColor;border-color:inherit}",
    ".commit-age{color:color-mix(in srgb,var(--color-kind-preset) var(--commit-freshness),var(--color-muted))}",
  ].join("\n");
  expect(auditSource("src/styles/example.css", source)).toEqual([]);
});

test.each([
  ["off-palette hex", ".x{color:#54AD94}"],
  ["rgb", ".x{color:rgb(7 24 29 / .96)}"],
  ["rgba", ".x{box-shadow:0 0 2px rgba(0,0,0,.4)}"],
  ["named color", ".x{color:white}"],
  ["extra color mix", ".x{color:color-mix(in srgb,red 50%,blue)}"],
  ["partial opacity", ".x{opacity:.5}"],
])("rejects %s", (_name, source) => {
  expect(auditSource("src/styles/example.css", source)).not.toEqual([]);
});

```

- [ ] **Step 2: Run the test to prove the production audit fails**

Run: `npm.cmd test -- tests/unit/palette-audit.test.ts --run`

Expected: FAIL because `scripts/audit-palette.mjs` does not exist.

- [ ] **Step 3: Implement the reusable scanner and CLI**

Add a direct development dependency for the complete CSS named-color registry:

Run: `npm.cmd install --save-dev color-name@1.1.4`

Create `scripts/audit-palette.mjs` with:

```js
import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import colorNames from "color-name";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const APPROVED_HEX = [
  "#07181D",
  "#0B2229",
  "#102B33",
  "#173740",
  "#284A52",
  "#3B6068",
  "#F3F1E8",
  "#CBD6D3",
  "#849A9E",
  "#D62839",
  "#57C5A3",
  "#E18A24",
];

const approved = new Set(APPROVED_HEX.map((value) => value.toLowerCase()));
const approvedMix =
  /color-mix\(\s*in\s+srgb\s*,\s*var\(--color-kind-preset\)\s+var\(--commit-freshness\)\s*,\s*var\(--color-muted\)\s*\)/gi;
const namedColorSource = Object.keys(colorNames)
  .sort((left, right) => right.length - left.length)
  .join("|");

function namedColorPattern() {
  return new RegExp(`(?<![\\w-])(?:${namedColorSource})(?![\\w-])`, "gi");
}

export function auditSource(path, source) {
  const violations = [];
  for (const match of source.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    if (!approved.has(match[0].toLowerCase())) {
      violations.push({ path, value: match[0], index: match.index });
    }
  }
  const withoutApprovedMix = source.replace(approvedMix, "");
  for (const match of withoutApprovedMix.matchAll(
    /\b(?:rgb|rgba|hsl|hsla|color-mix)\s*\([^)]*(?:\)[^)]*)?/gi,
  )) {
    violations.push({ path, value: match[0], index: match.index });
  }
  for (const match of withoutApprovedMix.matchAll(namedColorPattern())) {
    violations.push({ path, value: match[0], index: match.index });
  }
  for (const match of source.matchAll(/\bopacity\s*:\s*(\d*\.?\d+)/gi)) {
    if (!["0", "0.0", "1", "1.0"].includes(match[1])) {
      violations.push({ path, value: match[0], index: match.index });
    }
  }
  return violations;
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if ([".css", ".tsx", ".svg"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

export async function auditProductionPalette(root = repositoryRoot) {
  const roots = [resolve(root, "src"), resolve(root, "public")];
  const files = (await Promise.all(roots.map(sourceFiles))).flat();
  const violations = [];
  for (const path of files) {
    violations.push(...auditSource(path, await readFile(path, "utf8")));
  }
  return violations;
}

async function main() {
  const violations = await auditProductionPalette();
  if (violations.length) {
    for (const violation of violations) {
      console.error(`${violation.path}: unauthorized color ${violation.value}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Production palette verified");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [ ] **Step 4: Add the standalone audit command**

Add to `package.json`:

```json
"palette:audit": "node scripts/audit-palette.mjs"
```

- [ ] **Step 5: Run focused tests**

Run: `npm.cmd test -- tests/unit/palette-audit.test.ts --run`

Expected: helper tests PASS.

Run: `npm.cmd run palette:audit`

Expected: FAIL and list the existing off-palette production declarations. This is diagnostic evidence; the normal `check` command is not wired to the new audit until Task 2 makes production pass.

- [ ] **Step 6: Commit the red audit gate**

```powershell
git add scripts/audit-palette.mjs tests/unit/palette-audit.test.ts package.json package-lock.json
git commit -m "test: add production palette audit"
```

### Task 2: Convert production styling to the exact palette

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/about.css`
- Modify: `package.json`
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Test: `tests/unit/palette-audit.test.ts`

**Interfaces:**
- Consumes: `auditProductionPalette()`
- Produces: zero unauthorized production color declarations

- [ ] **Step 1: Add failing semantic palette contracts**

Extend `tests/unit/visual-alignment-contract.test.ts`:

```ts
test("uses the approved semantic colors", () => {
  const tokens = read("src/styles/tokens.css");
  const css = read("src/styles/catalog.css");
  expect(tokens).toContain("--color-muted: #849A9E");
  expect(css).toMatch(/\.category-navigation button\s*\{[^}]*color:\s*var\(--color-text-primary\)/s);
  expect(css).toMatch(/button\[data-category="frontend"\][\s\S]*?color:\s*var\(--color-kind-frontend\)/s);
  expect(css).toMatch(/\.card-identity\s*\{[^}]*color:\s*var\(--kind-color\)/s);
  expect(css).toMatch(/\.activity-bars i\s*\{[^}]*background:\s*var\(--color-kind-preset\)/s);
  expect(css).toMatch(/\.license-osi-approved\s*\{[^}]*color:\s*var\(--color-kind-preset\)/s);
  expect(css).toMatch(/\.frontend-chip\s*\{[^}]*border-color:\s*var\(--color-kind-frontend\)[^}]*color:\s*var\(--color-kind-frontend\)/s);
  expect(css).toMatch(/\.chip,[\s\S]*?\.license\s*\{[^}]*border:\s*1px solid var\(--color-border-strong\)[^}]*color:\s*var\(--color-text-secondary\)/s);
  expect(css).toMatch(/\.brand-name\s*\{[^}]*color:\s*var\(--color-kind-extension\)/s);
  expect(css).toMatch(/\.submit-link\s*\{[^}]*color:\s*var\(--color-kind-extension\)/s);
});
```

Add to `tests/unit/palette-audit.test.ts`:

```ts
import { auditProductionPalette } from "../../scripts/audit-palette.mjs";

test("finds no unauthorized colors in production sources", async () => {
  expect(await auditProductionPalette()).toEqual([]);
});
```

- [ ] **Step 2: Run the focused contracts to prove failure**

Run: `npm.cmd test -- tests/unit/visual-alignment-contract.test.ts tests/unit/palette-audit.test.ts --run`

Expected: FAIL on muted token, activity mint, license mint, frontend-chip colors, and the production audit.

- [ ] **Step 3: Replace token and component colors**

Make these exact changes:

```css
/* tokens.css */
--color-muted: #849A9E;
--shadow-raised: 0 18px 50px var(--color-page);

/* catalog.css semantic replacements */
.site-header { background: var(--color-page); }
.site-search { background: var(--color-surface-primary); }
.site-search:focus-within { box-shadow: 0 0 0 3px var(--color-border-strong); }
.site-search input::placeholder { color: var(--color-muted); }
.site-search kbd { background: var(--color-page); }
.filter-group legend,
.filter-group b,
.view-tabs button,
.development { color: var(--color-muted); }
.filter-search:focus,
.metadata-option:focus-within { box-shadow: 0 0 0 2px var(--color-border-strong); }
.active-query { background: var(--color-surface-card); }
.active-query .clear-query { color: var(--color-kind-extension); }
.project-card { box-shadow: 0 7px 18px var(--color-page); }
.project-card:focus-visible { box-shadow: 0 0 0 3px var(--color-kind-preset); }
.card-identity { color: var(--kind-color); }
.activity-score > b { color: var(--color-text-secondary); }
.activity-bars i { background: var(--color-kind-preset); }
.card-summary { color: var(--color-text-secondary); }
.chip,
.license {
  border: 1px solid var(--color-border-strong);
  color: var(--color-text-secondary);
  background: var(--color-surface-card);
}
.frontend-chip {
  border-color: var(--color-kind-frontend);
  color: var(--color-kind-frontend);
  background: var(--color-surface-card);
}
.license { border: 0; color: var(--color-muted); background: transparent; }
.license-osi-approved { color: var(--color-kind-preset); }
.license-proprietary,
.license-missing { color: var(--color-muted); }
.tooltip-content { background: var(--color-page); }
.catalog-empty,
.filter-overlay { background: var(--color-surface-primary); }
```

Delete `.commit-age.dormant`. Replace the decorative radial gradient in `about.css` with `background: var(--color-page)`.

- [ ] **Step 4: Run the audit and contracts**

Run: `npm.cmd run palette:audit`

Expected: `Production palette verified`.

Run: `npm.cmd test -- tests/unit/palette-audit.test.ts tests/unit/visual-alignment-contract.test.ts --run`

Expected: PASS.

- [ ] **Step 5: Make the passing audit part of `check`**

Insert `npm run palette:audit` after `npm run lint` in the `check` script.

- [ ] **Step 6: Commit palette normalization**

```powershell
git add src/styles tests/unit package.json
git commit -m "style: enforce exact site palette"
```

### Task 3: Add vocabulary-driven expandable frontend filters

**Files:**
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: `data/vocabularies/frontends.json`
- Produces: fixed top-three options plus dynamic `Show N more` / `Show fewer`

- [ ] **Step 1: Write failing desktop behavior tests**

Add to `tests/e2e/catalog.spec.ts`:

```ts
test("keeps canonical frontends ordered and expands the remainder", async ({ page }) => {
  const group = page.locator(".filter-panel").getByRole("group", {
    name: "Compatible frontend",
  });
  const labels = await group.locator("label").allTextContents();
  expect(labels.slice(0, 3).map((label) => label.replace(/\d+$/, "").trim())).toEqual([
    "SillyTavern",
    "Lumiverse",
    "Marinara Engine",
  ]);
  await expect(group.getByLabel("Lumiverse")).toBeVisible();
  await expect(group.getByText("0", { exact: true })).toBeVisible();
  await expect(group.getByLabel("Sonder Engine")).toBeHidden();
  await group.getByRole("button", { name: "Show 1 more" }).click();
  await expect(group.getByLabel("Sonder Engine")).toBeVisible();
  await expect(group.getByRole("button", { name: "Show fewer" })).toBeVisible();
});

test("search and selected extras bypass frontend collapse", async ({ page }) => {
  const group = page.locator(".filter-panel").getByRole("group", {
    name: "Compatible frontend",
  });
  const search = group.getByRole("searchbox");
  await search.fill("Sonder");
  await expect(group.getByLabel("Sonder Engine")).toBeVisible();
  await group.getByLabel("Sonder Engine").check();
  await search.fill("");
  await expect(group.getByLabel("Sonder Engine")).toBeVisible();
});
```

- [ ] **Step 2: Run tests to prove current project-derived behavior fails**

Run: `npm.cmd run test:e2e -- --grep "canonical frontends|selected extras"`

Expected: FAIL because Lumiverse and Sonder are absent and no expansion control exists.

- [ ] **Step 3: Import the canonical vocabulary and implement collapse logic**

In `filter-panel.tsx`, import:

```ts
import frontendVocabulary from "../../../../data/vocabularies/frontends.json";
```

Create:

```ts
const frontendOptions = frontendVocabulary.frontends.map(({ id, label }) => ({
  id,
  label,
}));
```

Extend the `FilterGroup` destructuring/type with:

```ts
initialVisibleCount,
// ...
initialVisibleCount?: number;
```

Inside it:

```ts
const [expanded, setExpanded] = useState(false);
const collapseLimit = initialVisibleCount ?? options.length;
const pinned = options.slice(0, collapseLimit);
const selectedExtras = options.filter(
  (option, index) =>
    index >= collapseLimit && selected.includes(option.id),
);
const collapsedIds = new Set(
  [...pinned, ...selectedExtras].map(({ id }) => id),
);
const collapsedOptions = options.filter(({ id }) => collapsedIds.has(id));
const searchedOptions = normalizedSearch
  ? options.filter(({ label }) =>
      label.toLocaleLowerCase().includes(normalizedSearch),
    )
  : options;
const visibleOptions = normalizedSearch
  ? searchedOptions
  : expanded
    ? options
    : collapsedOptions;
const hiddenCount = options.length - collapsedOptions.length;
```

After the list options, render:

```tsx
{!normalizedSearch && (hiddenCount > 0 || expanded) ? (
  <button
    className="more-frontends"
    type="button"
    aria-expanded={expanded}
    onClick={() => setExpanded((value) => !value)}
  >
    {expanded ? "Show fewer" : `Show ${hiddenCount} more`}
  </button>
) : null}
```

Pass `options={frontendOptions}` and `initialVisibleCount={3}` for Compatible frontend.

- [ ] **Step 4: Style the expansion control only with palette tokens**

```css
.more-frontends {
  width: 100%;
  border: 0;
  border-top: 1px solid var(--color-border);
  padding: 8px 0 0;
  color: var(--color-muted);
  background: transparent;
  cursor: pointer;
  font-size: 10px;
  text-align: left;
}

.more-frontends:hover {
  color: var(--color-text-secondary);
}
```

- [ ] **Step 5: Add mobile-sheet coverage**

Add to `tests/e2e/mobile.spec.ts`:

```ts
test("expands canonical mobile frontends", async ({ page }) => {
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Open filters" }).click();
  const group = page.getByRole("dialog", { name: "Filters" }).getByRole("group", {
    name: "Compatible frontend",
  });
  await expect(group.getByLabel("SillyTavern", { exact: true })).toBeVisible();
  await expect(group.getByLabel("Lumiverse")).toBeVisible();
  await expect(group.getByLabel("Marinara Engine")).toBeVisible();
  await expect(group.getByLabel("Sonder Engine")).toBeHidden();
  await group.getByRole("button", { name: "Show 1 more" }).click();
  await expect(group.getByLabel("Sonder Engine")).toBeVisible();
});
```

- [ ] **Step 6: Rebuild and run desktop/mobile tests**

Run: `npm.cmd run build`

Run: `npm.cmd run test:e2e -- --grep "canonical frontends|selected extras|mobile frontend"`

Expected: PASS.

- [ ] **Step 7: Commit frontend expansion**

```powershell
git add src/features/catalog/components/filter-panel.tsx src/styles/catalog.css tests/e2e
git commit -m "feat: expand canonical frontend filters"
```

### Task 4: Theme project-kind checkboxes

**Files:**
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: `CatalogKind`
- Produces: `data-kind` on Project kind inputs and custom kind-colored boxes

- [ ] **Step 1: Write a failing computed-style test**

Add:

```ts
test("themes project-kind checkbox outlines", async ({ page }) => {
  const expected = {
    Frontend: "rgb(214, 40, 57)",
    Extension: "rgb(225, 138, 36)",
    "System Preset": "rgb(87, 197, 163)",
  };
  for (const [name, color] of Object.entries(expected)) {
    const input = page
      .locator(".filter-panel")
      .getByLabel(name, { exact: true });
    await expect(input).toHaveCSS("border-top-color", color);
    await input.check();
    await expect(input).toHaveCSS("background-color", color);
  }
});
```

- [ ] **Step 2: Run the test to prove all inputs currently share one accent**

Run: `npm.cmd run test:e2e -- --grep "project-kind checkbox"`

Expected: FAIL.

- [ ] **Step 3: Add semantic input hooks**

When `group === "kinds"`, add:

```tsx
className="kind-checkbox"
data-kind={option.id}
```

- [ ] **Step 4: Implement the custom checkbox**

```css
.kind-checkbox {
  --checkbox-color: var(--color-kind-extension);
  display: grid;
  appearance: none;
  border: 1px solid var(--checkbox-color);
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
  place-content: center;
}

.kind-checkbox[data-kind="frontend"] {
  --checkbox-color: var(--color-kind-frontend);
}

.kind-checkbox[data-kind="preset"] {
  --checkbox-color: var(--color-kind-preset);
}

.kind-checkbox:checked {
  background: var(--checkbox-color);
}

.kind-checkbox:checked::before {
  width: 6px;
  height: 3px;
  border-bottom: 2px solid var(--color-page);
  border-left: 2px solid var(--color-page);
  content: "";
  transform: translateY(-1px) rotate(-45deg);
}
```

- [ ] **Step 5: Run the focused browser test**

Run: `npm.cmd run build`

Run: `npm.cmd run test:e2e -- --grep "project-kind checkbox"`

Expected: PASS.

- [ ] **Step 6: Commit checkbox theming**

```powershell
git add src/features/catalog/components/filter-panel.tsx src/styles/catalog.css tests/e2e/catalog.spec.ts
git commit -m "style: theme project-kind checkboxes"
```

### Task 5: Add deterministic commit-age fading

**Files:**
- Create: `src/features/catalog/commit-freshness.ts`
- Create: `tests/unit/commit-freshness.test.ts`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Produces: `daysSince(timestamp: string | null, now: string): number | null`
- Produces: `commitFreshnessPercent(timestamp: string | null, now: string): number`

- [ ] **Step 1: Write failing boundary tests**

```ts
import { expect, test } from "vitest";
import {
  commitFreshnessPercent,
  daysSince,
} from "@/features/catalog/commit-freshness";

const now = "2026-07-31T00:00:00Z";

test.each([
  ["2026-07-31T00:00:00Z", 100],
  ["2026-07-16T00:00:00Z", 50],
  ["2026-07-01T00:00:00Z", 0],
  ["2025-07-01T00:00:00Z", 0],
  [null, 0],
])("maps %s to %s percent freshness", (timestamp, expected) => {
  expect(commitFreshnessPercent(timestamp, now)).toBe(expected);
});

test("uses whole elapsed days", () => {
  expect(daysSince("2026-07-29T12:00:00Z", now)).toBe(1);
});
```

- [ ] **Step 2: Run tests to prove the utility is absent**

Run: `npm.cmd test -- tests/unit/commit-freshness.test.ts --run`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure helper**

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

export function daysSince(timestamp: string | null, now: string) {
  if (!timestamp) return null;
  return Math.max(
    0,
    Math.floor((new Date(now).getTime() - new Date(timestamp).getTime()) / DAY_MS),
  );
}

export function commitFreshnessPercent(
  timestamp: string | null,
  now: string,
) {
  const days = daysSince(timestamp, now);
  if (days === null) return 0;
  return Math.max(0, Math.min(100, 100 - (days / 30) * 100));
}
```

- [ ] **Step 4: Use one day calculation for text and color**

Update `relativeTime` to use `daysSince`. In `ProjectCard`, create:

```ts
const commitFreshness = commitFreshnessPercent(
  project.activity.latestMeaningfulCommitAt,
  now,
);
const commitAgeStyle = {
  "--commit-freshness": `${commitFreshness}%`,
} as React.CSSProperties;
```

Apply `style={commitAgeStyle}` to `.commit-age`.

- [ ] **Step 5: Add the only approved generated color**

```css
.commit-age {
  color: color-mix(
    in srgb,
    var(--color-kind-preset) var(--commit-freshness),
    var(--color-muted)
  );
}
```

- [ ] **Step 6: Verify unit, browser, and palette behavior**

Run: `npm.cmd test -- tests/unit/commit-freshness.test.ts tests/unit/palette-audit.test.ts --run`

Run: `npm.cmd run build`

Run: `npm.cmd run test:e2e -- --grep "card anatomy|card fact"`

Expected: PASS; fresh dates compute toward mint and 30-day dates compute muted.

- [ ] **Step 7: Commit aging behavior**

```powershell
git add src/features/catalog tests/unit/commit-freshness.test.ts tests/e2e/catalog.spec.ts src/styles/catalog.css
git commit -m "feat: fade commit age over thirty days"
```

### Task 6: Replace card-contained tooltips with a viewport portal

**Files:**
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Produces: `Tooltip({ id, label, children, className })`
- Removes: `align` prop and `.tooltip-align-left`

- [ ] **Step 1: Replace the current visibility test with a failing portal-boundary test**

Add a helper in `tests/e2e/catalog.spec.ts`:

```ts
async function expectTooltipInsideViewport(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator,
) {
  await trigger.hover();
  const id = await trigger.getAttribute("aria-describedby");
  if (!id) throw new Error("Missing tooltip id");
  const tooltip = page.locator(`#${id}`);
  await expect(tooltip).toBeVisible();
  expect(
    await tooltip.evaluate((element) => element.parentElement === document.body),
  ).toBe(true);
  const box = await tooltip.boundingBox();
  if (!box) throw new Error("Missing tooltip bounds");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Missing viewport");
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 8);
}
```

Use it for:

- first card `.card-identity`;
- SillyTavern `.community` from the reported screenshot;
- rightmost top-row `.repository-size`;
- bottom-row preset `.license`.

Also assert:

```ts
expect(
  await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
).toBeLessThanOrEqual(0);
```

- [ ] **Step 2: Run the clipping regression to prove failure**

Run: `npm.cmd run test:e2e -- --grep "tooltip.*viewport"`

Expected: FAIL because tooltip content is still a descendant of the card and the reported community tooltip crosses a boundary.

- [ ] **Step 3: Implement client-side portal positioning**

Replace `src/components/ui/tooltip.tsx` with:

```tsx
"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const VIEWPORT_MARGIN = 8;
const TOOLTIP_GAP = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function tooltipPosition(trigger: DOMRect, tooltip: DOMRect) {
  const left = clamp(
    trigger.left + trigger.width / 2 - tooltip.width / 2,
    VIEWPORT_MARGIN,
    window.innerWidth - tooltip.width - VIEWPORT_MARGIN,
  );
  const above = trigger.top - tooltip.height - TOOLTIP_GAP;
  const below = trigger.bottom + TOOLTIP_GAP;
  const preferredTop = above >= VIEWPORT_MARGIN ? above : below;
  const top = clamp(
    preferredTop,
    VIEWPORT_MARGIN,
    window.innerHeight - tooltip.height - VIEWPORT_MARGIN,
  );
  return { left, top };
}

export function Tooltip({
  id,
  label,
  children,
  className = "",
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);

  const hide = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  const show = useCallback(() => {
    if (window.matchMedia("(max-width: 760px)").matches) return;
    setOpen(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;
    setPosition(
      tooltipPosition(
        triggerRef.current.getBoundingClientRect(),
        tooltipRef.current.getBoundingClientRect(),
      ),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        className={`tooltip-anchor ${className}`}
        aria-describedby={id}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocusCapture={show}
        onBlurCapture={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            hide();
          }
        }}
      >
        {children}
      </span>
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={tooltipRef}
              className="tooltip-content tooltip-portal"
              id={id}
              role="tooltip"
              style={{
                ...position,
                visibility: position ? "visible" : "hidden",
              }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
```

- [ ] **Step 4: Centralize portal CSS and restore card clipping**

```css
.project-card {
  overflow: hidden;
}

.project-card:hover,
.project-card:focus-visible {
  z-index: auto;
  overflow: hidden;
}

.tooltip-content {
  position: fixed;
  z-index: 200;
  width: max-content;
  max-width: min(240px, calc(100vw - 16px));
  opacity: 1;
  pointer-events: none;
  transform: none;
}
```

Delete `.tooltip-align-left`, descendant hover/focus rules, and all `align` props in `ProjectCard`.

- [ ] **Step 5: Add mobile non-rendering coverage**

At 390px, hover a tooltip trigger and assert `page.getByRole("tooltip")` has count `0`.

- [ ] **Step 6: Rebuild and run portal regressions**

Run: `npm.cmd run build`

Run: `npm.cmd run test:e2e -- --grep "tooltip|card fact|mobile"`

Expected: all tooltips are body children, remain within viewport margins, and never appear on mobile.

- [ ] **Step 7: Commit the portal**

```powershell
git add src/components/ui/tooltip.tsx src/features/catalog/components/project-card.tsx src/styles tests/e2e
git commit -m "fix: keep tile tooltips in viewport"
```

### Task 7: Resize and reposition the inkwell

**Files:**
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**
- Produces: desktop 34×45px and mobile 31×41px transformed 12px left

- [ ] **Step 1: Add failing desktop and mobile geometry checks**

Desktop:

```ts
const logo = page.locator(".brand-logo");
await expect(logo).toHaveCSS("width", "34px");
await expect(logo).toHaveCSS("height", "45px");
await expect(logo).toHaveCSS("transform", "matrix(1, 0, 0, 1, -12, 0)");
```

Mobile expects `31px`, `41px`, and the same transform.

Extend `tests/unit/visual-alignment-contract.test.ts`:

```ts
test("uses the approved inkwell geometry", () => {
  const css = read("src/styles/catalog.css");
  const responsive = read("src/styles/responsive.css");
  expect(css).toMatch(
    /\.brand-logo\s*\{[^}]*width:\s*34px[^}]*height:\s*45px[^}]*transform:\s*translateX\(-12px\)/s,
  );
  expect(responsive).toMatch(
    /@media \(max-width:\s*760px\)[\s\S]*?\.brand-logo\s*\{[^}]*width:\s*31px[^}]*height:\s*41px[^}]*transform:\s*translateX\(-12px\)/,
  );
});
```

- [ ] **Step 2: Run focused tests to prove current 45×60/41×55 geometry fails**

Run: `npm.cmd run test:e2e -- --grep "header hierarchy|desktop workspace"`

Expected: FAIL on logo dimensions and transform.

- [ ] **Step 3: Apply approved geometry**

```css
.brand-logo {
  width: 34px;
  height: 45px;
  object-fit: contain;
  transform: translateX(-12px);
}
```

Mobile:

```css
.brand-logo {
  width: 31px;
  height: 41px;
  transform: translateX(-12px);
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd run build`

Run: `npm.cmd run test:e2e -- --grep "header hierarchy|desktop workspace"`

Expected: PASS with no header overlap.

- [ ] **Step 5: Commit header geometry**

```powershell
git add src/styles tests/e2e tests/unit/visual-alignment-contract.test.ts
git commit -m "style: tighten inkwell geometry"
```

### Task 8: Full verification and visual examination

**Files:**
- Update only after inspection:
  - `tests/visual/catalog.visual.spec.ts-snapshots/catalog-desktop-win32.png`
  - `tests/visual/catalog.visual.spec.ts-snapshots/catalog-tablet-win32.png`
  - `tests/visual/catalog.visual.spec.ts-snapshots/catalog-mobile-win32.png`

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified deployable branch

- [ ] **Step 1: Run the complete repository gate**

Run: `npm.cmd run check`

Expected: formatting, lint, palette audit, catalog validation/build, typecheck, 57+ unit tests, production build, and static-export verification all pass.

- [ ] **Step 2: Run all browser behavior tests**

Run: `npm.cmd run test:e2e`

Expected: all tests pass, including frontend expansion, semantic colors, portal boundaries, mobile behavior, and no overflow.

- [ ] **Step 3: Run visual regression without updating**

Run: `npm.cmd run test:visual`

Expected: reference-profile tests pass; pixel snapshots differ only for approved palette, inkwell, filter, and status changes.

- [ ] **Step 4: Inspect every actual and diff image**

Inspect desktop, tablet, and mobile actual/diff images. Confirm:

- no tooltip clipping at any tested anchor;
- near-white navigation labels and colored icons;
- crimson frontend chips without desaturated red/pink;
- secondary capability chips without unauthorized muted colors;
- mint activity bars, fresh age, and OSI license;
- kind-colored checkbox outlines;
- frontend top-three order and compact expansion;
- smaller inkwell shifted toward Tavernary;
- no horizontal overflow or card geometry regression.

- [ ] **Step 5: Update and re-run intentional visual baselines**

Run: `npm.cmd run test:visual -- --update-snapshots`

Then run: `npm.cmd run test:visual`

Expected: 5 visual tests pass without update mode.

- [ ] **Step 6: Run final source and worktree checks**

Run: `npm.cmd run palette:audit`

Expected: `Production palette verified`.

Run: `git diff --check`

Expected: exit 0.

Run: `git status --short`

Expected: only intentional source, test, and approved snapshot changes.

- [ ] **Step 7: Commit visual baselines**

```powershell
git add tests/visual
git commit -m "test: approve catalog polish visuals"
```
