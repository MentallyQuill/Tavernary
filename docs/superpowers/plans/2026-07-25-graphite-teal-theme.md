# Graphite Teal Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tavernary's current deep-teal palette with the exact approved Graphite Teal token system across every production surface and interaction state.

**Architecture:** Make `src/styles/tokens.css` the sole source of color truth, enforce that truth through `scripts/audit-palette.mjs`, and migrate selectors by semantic role instead of global value substitution. Preserve all existing component structure and behavior while unit contracts and Playwright computed-style checks prove that graphite, teal, crimson, mint, orange, and status colors are used only for their approved meanings.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS custom properties, Vitest, Playwright, Node.js palette audit

## Global Constraints

- Use the 98 token declarations and exact values in `docs/superpowers/specs/2026-07-25-graphite-teal-theme-design.md` section 2.2; do not modify any supplied value.
- Remove the legacy production color variables; do not leave compatibility aliases.
- Graphite defines structure.
- Teal defines general interaction, links, focus, navigation selection, and temporary Kit selection.
- Crimson identifies Frontends.
- Mint identifies System Presets, open licensing, progress, and success where explicitly specified.
- Heritage orange identifies functional categories, primary actions, and persistent In Kit state.
- Dedicated success, warning, danger, and information colors are not category colors.
- Keep category meaning redundant through existing labels and icons.
- Do not change layout, spacing, typography, copy, responsive behavior, motion, component behavior, logos, favicons, illustrations, or other artwork.
- Fix contrast problems only by choosing another supplied semantic foreground/background pairing or retaining non-color cues.
- Preserve unrelated worktree changes. At execution time, use `superpowers:using-git-worktrees` and start from a commit containing approved spec `863b1ea`.
- Use strict red-green-refactor cycles and commit after each task.

---

## File Structure

### Production files

- `src/styles/tokens.css` — canonical Graphite Teal tokens plus unchanged non-color layout tokens.
- `scripts/audit-palette.mjs` — allowlist and syntax enforcement for production colors, shadows, and the one activity interpolation.
- `src/app/globals.css` — document canvas, text, and global focus treatment.
- `src/app/layout.tsx` — exact pre-CSS document background.
- `src/styles/catalog.css` — controls, header, navigation, filters, cards, metadata, Kits, overlays, and interaction states.
- `src/styles/responsive.css` — responsive instances of the same semantic roles.
- `src/styles/about.css` — About canvas, typography, links, dividers, and primary action.

### Test files

- `tests/unit/theme-token-contract.test.ts` — exact token names and values, non-color token retention, and legacy-token removal.
- `tests/unit/palette-audit.test.ts` — allowed theme syntax and rejection of color values or exceptions outside the contract.
- `tests/unit/visual-alignment-contract.test.ts` — selector-to-token semantic assignments.
- `tests/visual/theme.visual.spec.ts` — browser-computed colors on Catalog, Kits, Kit Builder, and About at desktop and mobile sizes.
- Existing E2E and visual specs remain behavior and geometry regression coverage.

No new runtime abstraction or dependency is needed.

---

### Task 1: Install the canonical token and palette-enforcement foundation

**Files:**

- Create: `tests/unit/theme-token-contract.test.ts`
- Modify: `tests/unit/palette-audit.test.ts`
- Modify: `scripts/audit-palette.mjs`
- Modify: `src/styles/tokens.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `src/styles/about.css`

**Interfaces:**

- Consumes: the exact `:root` declaration block from approved design section 2.2.
- Produces: the 98 canonical Graphite Teal custom properties, unchanged `--radius`, `--header-height`, `--category-height`, and `--content-max`, an updated `APPROVED_HEX` export, and production CSS with no references to removed legacy variables.

- [ ] **Step 1: Write the failing canonical-token contract**

Create `tests/unit/theme-token-contract.test.ts` with a small declaration
parser and an exact expected record copied from approved design section 2.2:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const tokensSource = readFileSync(
  resolve(root, "src/styles/tokens.css"),
  "utf8",
);

function declarations(source: string) {
  return Object.fromEntries(
    [...source.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].replace(/\s+/g, " ").trim(),
    ]),
  );
}

const EXPECTED_THEME_TOKENS = {
  "color-bg-canvas": "#0D1117",
  "color-bg-header": "#101820",
  "color-bg-sidebar": "#121A1F",
  "color-bg-surface": "#182228",
  "color-bg-surface-raised": "#1C282E",
  "color-bg-surface-hover": "#223138",
  "color-bg-surface-active": "#153B39",
  "color-bg-input": "#10191E",
  "color-bg-overlay": "#202C32",
  "color-bg-disabled": "#171F23",
  "color-border-subtle": "#223038",
  "color-border-default": "#2B3A40",
  "color-border-strong": "#3E535B",
  "color-border-hover": "#506870",
  "color-divider": "#26363D",
  "color-text-primary": "#E6EDF3",
  "color-text-secondary": "#A8B3BA",
  "color-text-muted": "#829099",
  "color-text-disabled": "#5F6B72",
  "color-text-inverse": "#0D1117",
  "color-heading": "#F0F5F7",
  "color-link": "#6EE7D8",
  "color-link-hover": "#99F6E4",
  "color-accent-teal": "#2DD4BF",
  "color-accent-teal-hover": "#5EEAD4",
  "color-accent-teal-pressed": "#14B8A6",
  "color-accent-teal-muted": "#238F85",
  "color-accent-teal-bg": "#153B39",
  "color-accent-teal-bg-hover": "#1B4A46",
  "color-accent-teal-border": "#28635E",
  "color-accent-teal-text": "#8CE9DE",
  "color-focus-ring": "#5EEAD4",
  "color-frontend": "#D62839",
  "color-frontend-hover": "#E33B4C",
  "color-frontend-pressed": "#B71F30",
  "color-frontend-bg": "#35181F",
  "color-frontend-bg-hover": "#431D25",
  "color-frontend-border": "#7C2936",
  "color-frontend-text": "#FF8B95",
  "color-preset": "#57C5A3",
  "color-preset-hover": "#72D4B6",
  "color-preset-pressed": "#3EAC8C",
  "color-preset-bg": "#15352E",
  "color-preset-bg-hover": "#1B443A",
  "color-preset-border": "#347A67",
  "color-preset-text": "#8BE0C5",
  "color-functional": "#E18A24",
  "color-functional-hover": "#F0A145",
  "color-functional-pressed": "#C87416",
  "color-functional-bg": "#3B2814",
  "color-functional-bg-hover": "#4A3217",
  "color-functional-border": "#8A5720",
  "color-functional-text": "#FFC171",
  "color-action-primary-bg": "#E18A24",
  "color-action-primary-hover": "#F0A145",
  "color-action-primary-pressed": "#C87416",
  "color-action-primary-text": "#161008",
  "color-action-secondary-bg": "#1C282E",
  "color-action-secondary-hover": "#26363D",
  "color-action-secondary-border": "#3E535B",
  "color-action-secondary-text": "#E6EDF3",
  "color-control-bg": "#10191E",
  "color-control-bg-hover": "#172329",
  "color-control-border": "#304249",
  "color-control-border-hover": "#486068",
  "color-control-border-focus": "#2DD4BF",
  "color-control-text": "#E6EDF3",
  "color-control-placeholder": "#718087",
  "color-checkbox-bg": "#121A1F",
  "color-checkbox-border": "#506168",
  "color-checkbox-checked": "#2DD4BF",
  "color-checkbox-checkmark": "#071413",
  "color-success": "#3FB950",
  "color-success-bg": "#16351F",
  "color-success-border": "#2E6B3D",
  "color-success-text": "#7EE787",
  "color-warning": "#D29922",
  "color-warning-bg": "#3A2D12",
  "color-warning-border": "#7A5B18",
  "color-warning-text": "#E3B341",
  "color-danger": "#F85149",
  "color-danger-bg": "#3D1B1F",
  "color-danger-border": "#8C2F35",
  "color-danger-text": "#FF7B72",
  "color-info": "#58A6FF",
  "color-info-bg": "#162B45",
  "color-info-border": "#315F91",
  "color-info-text": "#79C0FF",
  "color-activity-current": "#2DD4BF",
  "color-activity-recent": "#829099",
  "color-activity-dormant": "#5F6B72",
  "color-progress-track": "#26363D",
  "color-progress-fill": "#57C5A3",
  "color-license-open": "#57C5A3",
  "color-license-proprietary": "#A8B3BA",
  "color-license-missing": "#829099",
  "shadow-card":
    "0 1px 2px rgb(0 0 0 / 24%), 0 4px 12px rgb(0 0 0 / 12%)",
  "shadow-overlay": "0 12px 32px rgb(0 0 0 / 40%)",
} as const;

const LEGACY_TOKENS = [
  "color-page",
  "color-surface-primary",
  "color-surface-card",
  "color-surface-raised",
  "color-border",
  "color-navigation-primary",
  "color-muted",
  "color-filled-control-text",
  "color-kind-extension",
  "color-kind-frontend",
  "color-kind-preset",
  "shadow-raised",
] as const;

describe("Graphite Teal token contract", () => {
  test("defines every approved theme token with its exact value", () => {
    const actual = declarations(tokensSource);
    expect(
      Object.fromEntries(
        Object.keys(EXPECTED_THEME_TOKENS).map((name) => [name, actual[name]]),
      ),
    ).toEqual(EXPECTED_THEME_TOKENS);
  });

  test("removes legacy color aliases while retaining layout tokens", () => {
    const actual = declarations(tokensSource);
    for (const name of LEGACY_TOKENS) expect(actual[name]).toBeUndefined();
    expect(actual.radius).toBe("8px");
    expect(actual["header-height"]).toBe("78px");
    expect(actual["category-height"]).toBe("62px");
    expect(actual["content-max"]).toBe("1520px");
  });
});
```

- [ ] **Step 2: Extend the failing palette-audit tests**

Replace old-palette expectations in `tests/unit/palette-audit.test.ts` and add
tests proving the exceptions are location-scoped:

```ts
test("accepts the exact Graphite Teal palette", () => {
  expect(APPROVED_HEX).toContain("#0D1117");
  expect(APPROVED_HEX).toContain("#2DD4BF");
  expect(APPROVED_HEX).toContain("#D62839");
  expect(APPROVED_HEX).toContain("#57C5A3");
  expect(APPROVED_HEX).toContain("#E18A24");
  expect(APPROVED_HEX).not.toContain("#07181D");
});

test("allows only the approved activity interpolation", () => {
  const approved =
    ".commit-age{color:color-mix(in srgb,var(--color-activity-current) var(--commit-freshness),var(--color-activity-recent))}";
  expect(auditSource("src/styles/catalog.css", approved)).toEqual([]);
  expect(
    auditSource(
      "src/styles/catalog.css",
      approved.replace("--color-activity-recent", "--color-text-muted"),
    ),
  ).not.toEqual([]);
});

test("allows translucent black only in the canonical shadow tokens", () => {
  const tokens = [
    ":root {",
    "--shadow-card: 0 1px 2px rgb(0 0 0 / 24%), 0 4px 12px rgb(0 0 0 / 12%);",
    "--shadow-overlay: 0 12px 32px rgb(0 0 0 / 40%);",
    "}",
  ].join("\n");
  expect(auditSource("src/styles/tokens.css", tokens)).toEqual([]);
  expect(
    auditSource(
      "src/styles/catalog.css",
      ".x{box-shadow:0 1px 2px rgb(0 0 0 / 24%)}",
    ),
  ).not.toEqual([]);
  expect(
    auditSource(
      "src/styles/tokens.css",
      tokens.replace("24%", "25%"),
    ),
  ).not.toEqual([]);
});
```

- [ ] **Step 3: Run the new contracts to verify red**

Run:

```powershell
npm.cmd test -- tests/unit/theme-token-contract.test.ts tests/unit/palette-audit.test.ts
```

Expected: FAIL because the canonical variables are missing, the legacy
variables remain, and the audit still recognizes the old palette and old
activity interpolation.

- [ ] **Step 4: Implement exact tokens and audit exceptions**

Replace the color and shadow declarations in `src/styles/tokens.css` with the
exact `:root` block from approved design section 2.2. Append the unchanged
layout declarations:

```css
--radius: 8px;
--header-height: 78px;
--category-height: 62px;
--content-max: 1520px;
```

In `scripts/audit-palette.mjs`:

1. Replace `APPROVED_HEX` with the unique exact hex values used by the new
   token contract.
2. Replace `ALLOWED_COLOR_MIX` with:

```js
const ALLOWED_COLOR_MIX =
  /color-mix\(\s*in\s+srgb\s*,\s*var\(\s*--color-activity-current\s*\)\s+var\(\s*--commit-freshness\s*\)\s*,\s*var\(\s*--color-activity-recent\s*\)\s*\)/gi;
```

3. Before functional-color and opacity checks, blank only the complete exact
   `--shadow-card` and `--shadow-overlay` declarations when
   `file.replaceAll("\\", "/").endsWith("src/styles/tokens.css")`. Preserve
   newlines while blanking so violation line numbers stay accurate.
4. Do not globally allow `rgb()` or partial opacity.

- [ ] **Step 5: Perform the compile-safe legacy reference migration**

Replace every removed variable in production sources according to this
baseline:

| Removed variable | Initial canonical replacement |
| --- | --- |
| `--color-page` | `--color-bg-canvas` |
| `--color-surface-primary` | `--color-bg-sidebar` |
| `--color-surface-card` | `--color-bg-surface` |
| `--color-surface-raised` | `--color-bg-surface-raised` |
| `--color-border` | `--color-border-default` |
| `--color-border-strong` | `--color-border-strong` |
| `--color-navigation-primary` | `--color-accent-teal` |
| `--color-muted` | `--color-text-muted` |
| `--color-filled-control-text` | `--color-action-primary-text` |
| `--color-kind-extension` | `--color-functional` |
| `--color-kind-frontend` | `--color-frontend` |
| `--color-kind-preset` | `--color-preset` |
| `--shadow-raised` | `--shadow-overlay` |

This step only establishes valid canonical references. Tasks 2 and 3 assign
more specific hover, active, text, border, status, and surface variants.

Also make these exact replacements:

```tsx
<html lang="en" style={{ backgroundColor: "#0D1117" }}>
```

```css
html,
body {
  background: var(--color-bg-canvas);
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
a:focus-visible {
  outline: 2px solid var(--color-focus-ring);
}
```

Replace About's undefined `--color-accent` with `--color-link` and add
`color: var(--color-link-hover)` to the existing About link hover rule.

- [ ] **Step 6: Run token, audit, and compile checks**

Run:

```powershell
npm.cmd test -- tests/unit/theme-token-contract.test.ts tests/unit/palette-audit.test.ts
npm.cmd run palette:audit
npm.cmd run typecheck
```

Expected: all commands PASS. The production audit reports
`Production palette verified`.

- [ ] **Step 7: Confirm no legacy variables remain**

Run:

```powershell
rg --pcre2 -n --glob 'src/**' --glob 'tests/**' --glob 'scripts/**' -- '--color-page|--color-surface-primary|--color-surface-card|--color-surface-raised|--color-border(?!-)|--color-navigation-primary|--color-muted|--color-filled-control-text|--color-kind-extension|--color-kind-frontend|--color-kind-preset|--shadow-raised'
```

Expected: no production or current-test matches. References quoted inside the
legacy-removal test are permitted and must be checked manually rather than
deleted.

- [ ] **Step 8: Commit**

```powershell
git add src/styles/tokens.css src/app/layout.tsx src/app/globals.css src/styles/catalog.css src/styles/responsive.css src/styles/about.css scripts/audit-palette.mjs tests/unit/theme-token-contract.test.ts tests/unit/palette-audit.test.ts
git commit -m "style(theme): install graphite teal tokens"
```

---

### Task 2: Remap structural surfaces, navigation, links, and controls

**Files:**

- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `src/app/globals.css`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `src/styles/about.css`

**Interfaces:**

- Consumes: canonical variables established in Task 1.
- Produces: graphite application hierarchy, teal general interaction, and exact form-control state assignments without changing selector structure.

- [ ] **Step 1: Replace old semantic assertions with failing Graphite Teal assertions**

Add a focused `describe("Graphite Teal semantic roles", ...)` block to
`tests/unit/visual-alignment-contract.test.ts`:

```ts
test("assigns graphite surfaces by application layer", () => {
  expect(css).toMatch(
    /\.site-header\s*\{[^}]*background:\s*var\(--color-bg-header\)/s,
  );
  expect(css).toMatch(
    /\.category-navigation\s*\{[^}]*background:\s*var\(--color-bg-sidebar\)/s,
  );
  expect(css).toMatch(
    /\.filter-panel\s*\{[^}]*background:\s*var\(--color-bg-sidebar\)/s,
  );
  expect(css).toMatch(
    /\.catalog-main\s*\{[^}]*background:\s*var\(--color-bg-canvas\)/s,
  );
  expect(css).toMatch(
    /\.kit-builder-panel\s*\{[^}]*background:\s*var\(--color-bg-surface-raised\)/s,
  );
});

test("uses teal for navigation selection and general focus", () => {
  expect(css).toMatch(
    /\.category-navigation button\.active\s*\{[^}]*color:\s*var\(--color-accent-teal-text\)[^}]*border-color:\s*var\(--color-accent-teal-border\)[^}]*background:\s*var\(--color-accent-teal-bg\)/s,
  );
  expect(css).toMatch(
    /\.site-search:focus-within\s*\{[^}]*border-color:\s*var\(--color-control-border-focus\)/s,
  );
  expect(globals).toMatch(
    /:focus-visible[\s\S]*?outline:\s*2px solid var\(--color-focus-ring\)/s,
  );
});

test("uses the complete control state families", () => {
  expect(css).toMatch(
    /\.control-primary\s*\{[^}]*color:\s*var\(--color-action-primary-text\)[^}]*background:\s*var\(--color-action-primary-bg\)/s,
  );
  expect(css).toMatch(
    /\.control-primary:hover[^}]*\{[^}]*background:\s*var\(--color-action-primary-hover\)/s,
  );
  expect(css).toMatch(
    /\.control-primary:active[^}]*\{[^}]*background:\s*var\(--color-action-primary-pressed\)/s,
  );
  expect(css).toMatch(
    /\.control-secondary\s*\{[^}]*color:\s*var\(--color-action-secondary-text\)[^}]*background:\s*var\(--color-action-secondary-bg\)/s,
  );
});
```

Define `globals` beside the existing `css`, `responsive`, and `tokens` reads if
the current test scope does not already expose it.

- [ ] **Step 2: Run the semantic contract to verify red**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because the baseline substitutions do not yet distinguish
header/sidebar/canvas, teal active navigation, or full control state families.

- [ ] **Step 3: Assign structural and navigation roles**

Update existing selectors in `src/styles/catalog.css` without changing their
geometry:

```css
.site-header {
  border-bottom-color: var(--color-divider);
  background: var(--color-bg-header);
}

.category-navigation,
.filter-panel {
  background: var(--color-bg-sidebar);
}

.catalog-main {
  background: var(--color-bg-canvas);
}

.category-navigation button {
  color: var(--color-text-primary);
  background: var(--color-bg-sidebar);
}

.category-navigation button:hover {
  color: var(--color-accent-teal-text);
  border-color: var(--color-accent-teal-border);
  background: var(--color-accent-teal-bg-hover);
}

.category-navigation button.active {
  color: var(--color-accent-teal-text);
  border-color: var(--color-accent-teal-border);
  background: var(--color-accent-teal-bg);
}
```

Keep category marks independent of container selection:

```css
.category-navigation button[data-category="frontend"] svg {
  color: var(--color-frontend);
}

.category-navigation button[data-category="preset"] svg {
  color: var(--color-preset);
}

.category-navigation
  button:not([data-category="all"]):not([data-category="kits"]):not(
    [data-category="frontend"]
  ):not([data-category="preset"])
  svg {
  color: var(--color-functional);
}

.category-navigation button:is([data-category="kits"], [data-category="all"])
  svg,
.category-navigation button[data-category="all"] .all-symbol {
  color: var(--color-accent-teal);
}
```

- [ ] **Step 4: Assign controls, forms, links, and disabled states**

Use the action family for `.control-primary`, `.submit-link`, About
`.primary-action`, and equivalent submission buttons. Use the secondary-action
family for `.control-secondary`. Use the form-control family for search,
selects, text inputs, textareas, range controls, and metadata controls:

```css
.site-search,
.control-select,
input,
textarea,
select {
  color: var(--color-control-text);
  border-color: var(--color-control-border);
  background: var(--color-control-bg);
}

.site-search:hover,
.control-select:hover {
  border-color: var(--color-control-border-hover);
  background: var(--color-control-bg-hover);
}

.site-search:focus-within,
.control-select:focus-visible {
  border-color: var(--color-control-border-focus);
}

input::placeholder,
textarea::placeholder {
  color: var(--color-control-placeholder);
}
```

Preserve selector specificity already used in `catalog.css`; do not introduce a
global input rule if it overrides checkboxes or range inputs. Apply the
declarations to the existing selector groups instead.

Use `--color-bg-disabled`, `--color-text-disabled`, and
`--color-border-subtle` for disabled controls. Use `--color-link` and
`--color-link-hover` for textual links. Use `--color-checkbox-*` for custom
checkbox backgrounds, borders, checked fill, and checkmark.

- [ ] **Step 5: Remap responsive duplicates**

In `src/styles/responsive.css`, keep every breakpoint and dimension intact but
make mobile header, mobile filter dialog, mobile navigation, and responsive Kit
Builder use the same semantic backgrounds and borders as their desktop
counterparts:

- mobile site header: `--color-bg-header`;
- mobile category/filter surfaces: `--color-bg-sidebar`;
- mobile dialog/detached Builder: `--color-bg-overlay` and
  `--shadow-overlay`;
- in-page Builder: `--color-bg-surface-raised`;
- dividers: `--color-divider`;
- focus rings: `--color-focus-ring`.

- [ ] **Step 6: Run focused verification**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts tests/unit/theme-token-contract.test.ts tests/unit/palette-audit.test.ts
npm.cmd run palette:audit
npm.cmd run typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/app/globals.css src/styles/catalog.css src/styles/responsive.css src/styles/about.css tests/unit/visual-alignment-contract.test.ts
git commit -m "style(theme): remap surfaces and controls"
```

---

### Task 3: Remap cards, classification, Kits, metadata, and status

**Files:**

- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`

**Interfaces:**

- Consumes: canonical theme and structural/control mappings from Tasks 1–2.
- Produces: exact classification, selection, membership, activity, progress, licensing, and semantic-status assignments.

- [ ] **Step 1: Write failing card and Kit semantic contracts**

Add exact assertions:

```ts
test("separates project classification from card interaction", () => {
  expect(css).toMatch(
    /\.project-card\s*\{[^}]*background:\s*var\(--color-bg-surface\)[^}]*box-shadow:\s*var\(--shadow-card\)/s,
  );
  expect(css).toMatch(
    /\.project-card:hover[^}]*\{[^}]*border-color:\s*var\(--color-border-hover\)[^}]*background:\s*var\(--color-bg-surface-hover\)/s,
  );
  expect(css).toMatch(
    /\.project-card\.kind-frontend\s*\{[^}]*--kind-color:\s*var\(--color-frontend\)/s,
  );
  expect(css).toMatch(
    /\.project-card\.kind-preset\s*\{[^}]*--kind-color:\s*var\(--color-preset\)/s,
  );
  expect(css).toMatch(
    /\.project-card\s*\{[^}]*--kind-color:\s*var\(--color-functional\)/s,
  );
});

test("uses teal for pending selection and orange for persistent membership", () => {
  expect(css).toMatch(
    /\.project-card-shell\.selected \.project-card\s*\{[^}]*outline:\s*2px solid var\(--color-accent-teal\)/s,
  );
  expect(css).toMatch(
    /\.project-card-shell\.in-draft \.project-card\s*\{[^}]*border-color:\s*var\(--color-functional\)/s,
  );
  expect(css).toMatch(
    /\.project-kit-control-face\s*\{[^}]*color:\s*var\(--color-action-primary-text\)[^}]*background:\s*var\(--color-action-primary-bg\)/s,
  );
});

test("keeps metadata and statuses in dedicated semantic families", () => {
  expect(css).toMatch(
    /\.activity-weeks i\.active\s*\{[^}]*background:\s*var\(--color-activity-current\)/s,
  );
  expect(css).toContain(
    "var(--color-activity-current) var(--commit-freshness)",
  );
  expect(css).toContain("var(--color-activity-recent)");
  expect(css).toMatch(
    /\.license-osi-approved\s*\{[^}]*color:\s*var\(--color-license-open\)/s,
  );
  expect(css).toMatch(
    /\.license-proprietary\s*\{[^}]*color:\s*var\(--color-license-proprietary\)/s,
  );
  expect(css).toMatch(
    /\.license-missing\s*\{[^}]*color:\s*var\(--color-license-missing\)/s,
  );
  expect(css).toMatch(
    /\.kit-draft-restore-notice\s*\{[^}]*border-left:\s*3px solid var\(--color-info-border\)[^}]*color:\s*var\(--color-info-text\)[^}]*background:\s*var\(--color-info-bg\)/s,
  );
  expect(css).toMatch(
    /\.kit-builder-field-error\s*\{[^}]*color:\s*var\(--color-danger-text\)/s,
  );
  expect(css).toMatch(
    /\.kit-builder-errors\s*\{[^}]*color:\s*var\(--color-danger-text\)/s,
  );
});
```

- [ ] **Step 2: Run the contract to verify red**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL on old generic token assignments for card hover, selection,
activity, licensing, and Kit controls.

- [ ] **Step 3: Implement card surface and classification states**

Use:

```css
.project-card {
  --kind-color: var(--color-functional);
  color: var(--color-text-primary);
  border-color: var(--color-border-default);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-card);
}

.project-card.kind-frontend {
  --kind-color: var(--color-frontend);
}

.project-card.kind-preset {
  --kind-color: var(--color-preset);
}

.project-card:hover {
  border-color: var(--color-border-hover);
  background: var(--color-bg-surface-hover);
}

.project-card:focus-visible {
  border-color: var(--color-accent-teal);
  outline: 2px solid var(--color-accent-teal-bg);
}
```

Keep `.card-identity` and graphical marks on `--kind-color`. Where compact
classification text needs a brighter foreground, assign
`--color-frontend-text`, `--color-preset-text`, or
`--color-functional-text` through the existing kind classes. Do not tint the
whole card or add a category stripe.

- [ ] **Step 4: Implement Kit selection and membership states**

Map transient `.selected` state and selection dock interaction to the teal
family. Map `.in-draft`, `.project-in-draft`, add/remove faces, Builder remove
controls, and persistent membership emphasis to the functional/action family:

```css
.project-card-shell.selected .project-card {
  outline: 2px solid var(--color-accent-teal);
  background: var(--color-bg-surface-active);
}

.project-card-shell.in-draft .project-card {
  border-color: var(--color-functional);
  box-shadow: 0 0 0 1px var(--color-functional);
}

.project-kit-control-face,
.kit-builder-remove > span {
  color: var(--color-action-primary-text);
  background: var(--color-action-primary-bg);
}

.project-kit-control:is(:hover, :focus-visible) .project-kit-control-face,
.kit-builder-remove:is(:hover, :focus-visible) > span {
  background: var(--color-action-primary-hover);
}

.project-kit-control:active .project-kit-control-face,
.kit-builder-remove:active > span {
  background: var(--color-action-primary-pressed);
}
```

Preserve the pushed-in `aria-pressed="true"` inset treatment and all existing
dimensions, hit targets, card-body links, and immediate removal behavior.

- [ ] **Step 5: Implement category-specific Builder and metadata roles**

- `.kit-frontend-slot`: crimson border family; invalid drop remains clearly
  labeled and uses danger only if it represents an error rather than Frontend
  identity.
- Preset rows/labels: mint family.
- Functional rows/labels: orange family.
- active activity week: `--color-activity-current`;
- recent/dormant weeks: corresponding activity greys;
- commit-age interpolation: the single approved expression;
- dual-range track: `--color-progress-track`;
- selected dual-range fill and thumbs: `--color-progress-fill`;
- open/proprietary/missing licenses: dedicated license tokens;
- `.kit-draft-restore-notice`: `--color-info-bg`,
  `--color-info-border`, and `--color-info-text`;
- `.kit-builder-field-error` and `.kit-builder-errors`:
  `--color-danger-text`;
- `.kit-builder-rail-status` and `.kit-draft-access-status`:
  `--color-text-muted`.

Implement the existing information and error selectors exactly:

```css
.kit-draft-restore-notice {
  border-left-color: var(--color-info-border);
  color: var(--color-info-text);
  background: var(--color-info-bg);
}

.kit-builder-field-error,
.kit-builder-errors {
  color: var(--color-danger-text);
}
```

Never assign `--color-frontend` to an error or `--color-danger` to Frontend
classification.

- [ ] **Step 6: Run focused behavior and contract verification**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts tests/unit/project-card.test.tsx tests/unit/project-selection-dock.test.tsx tests/unit/kit-builder.test.tsx tests/unit/kit-filter-panel.test.tsx
npm.cmd run palette:audit
npm.cmd run typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/styles/catalog.css src/styles/responsive.css tests/unit/visual-alignment-contract.test.ts
git commit -m "style(theme): remap cards and kit states"
```

---

### Task 4: Add browser-level theme verification

**Files:**

- Create: `tests/visual/theme.visual.spec.ts`

**Interfaces:**

- Consumes: rendered Catalog, Kits, Kit Builder, and About surfaces from Tasks 1–3.
- Produces: desktop/mobile computed-style evidence for the site-wide semantic mapping while existing visual suites continue checking geometry and overflow.

- [ ] **Step 1: Write failing computed-style tests**

Create `tests/visual/theme.visual.spec.ts`:

```ts
import { expect, test, type Locator, type Page } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

const COLORS = {
  canvas: "rgb(13, 17, 23)",
  header: "rgb(16, 24, 32)",
  sidebar: "rgb(18, 26, 31)",
  surface: "rgb(24, 34, 40)",
  raised: "rgb(28, 40, 46)",
  overlay: "rgb(32, 44, 50)",
  teal: "rgb(45, 212, 191)",
  tealBackground: "rgb(21, 59, 57)",
  crimson: "rgb(214, 40, 57)",
  mint: "rgb(87, 197, 163)",
  orange: "rgb(225, 138, 36)",
} as const;

type ColorProperty = "backgroundColor" | "color" | "outlineColor";

async function color(locator: Locator, property: ColorProperty) {
  return locator.evaluate(
    (element, name) => getComputedStyle(element)[name],
    property,
  );
}

async function openCategoriesOnMobile(page: Page) {
  const button = page.getByRole("button", { name: "Browse categories" });
  if (await button.isVisible()) await button.click();
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} catalog uses graphite structure and teal selection`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath());
    await openCategoriesOnMobile(page);

    await expect
      .poll(() => color(page.locator("body"), "backgroundColor"))
      .toBe(COLORS.canvas);
    await expect
      .poll(() => color(page.locator(".site-header"), "backgroundColor"))
      .toBe(COLORS.header);
    await expect
      .poll(() => color(page.locator(".category-navigation"), "backgroundColor"))
      .toBe(COLORS.sidebar);
    await expect
      .poll(() => color(page.locator(".project-card").first(), "backgroundColor"))
      .toBe(COLORS.surface);

    const all = page.getByRole("button", { name: "All Projects" });
    await expect(all).toHaveClass(/active/);
    await expect.poll(() => color(all, "backgroundColor")).toBe(
      COLORS.tealBackground,
    );
  });
}

test("category marks retain crimson, mint, and orange identities", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());
  await expect
    .poll(() =>
      color(
        page.locator('[data-category="frontend"] svg'),
        "color",
      ),
    )
    .toBe(COLORS.crimson);
  await expect
    .poll(() =>
      color(page.locator('[data-category="preset"] svg'), "color"),
    )
    .toBe(COLORS.mint);
  await expect
    .poll(() =>
      color(
        page.locator('[data-category="generation-reasoning"] svg'),
        "color",
      ),
    )
    .toBe(COLORS.orange);
});

test("Kit selection is teal while persistent membership is orange", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());
  const control = page.locator(".project-kit-control").first();
  await control.click();
  const shell = page.locator(".project-card-shell").first();
  await expect(shell).toHaveClass(/selected/);
  await expect
    .poll(() => color(shell.locator(".project-card"), "outlineColor"))
    .toBe(COLORS.teal);
  await expect
    .poll(() => color(control.locator(".project-kit-control-face"), "backgroundColor"))
    .toBe(COLORS.orange);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} Kit Builder uses its approved elevation`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath());
    await openCategoriesOnMobile(page);
    await page.getByRole("button", { name: "Kits", exact: true }).click();
    await page.getByRole("button", { name: "Create new Kit" }).click();
    const builder =
      viewport.name === "mobile"
        ? page.getByRole("dialog", { name: "Kit Builder" })
        : page.getByRole("complementary", { name: "Kit Builder" });
    await expect(builder).toBeVisible();
    await expect
      .poll(() => color(builder, "backgroundColor"))
      .toBe(viewport.name === "mobile" ? COLORS.overlay : COLORS.raised);
  });

  test(`${viewport.name} About uses graphite canvas and teal links`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath("/about"));
    await expect
      .poll(() => color(page.locator(".about-page"), "backgroundColor"))
      .toBe(COLORS.canvas);
    await expect
      .poll(() => color(page.locator(".about-nav a").first(), "color"))
      .toBe("rgb(110, 231, 216)");
  });
}
```

The functional-category assertion deliberately uses the existing stable
`data-category="generation-reasoning"` value; do not add production markup
solely for this test.

- [ ] **Step 2: Run the theme visual spec to verify red**

Run:

```powershell
node scripts/run-playwright.mjs tests/visual/theme.visual.spec.ts
```

Expected: at least one assertion FAILS if any remaining selector still uses a
baseline rather than its final semantic token. If every assertion already
passes, temporarily change the expected canvas value to
`rgb(14, 17, 23)`, verify that the test fails, then restore
`rgb(13, 17, 23)`.

- [ ] **Step 3: Correct only observed semantic mismatches**

For each failing computed-style assertion:

1. identify the winning selector with browser computed styles;
2. change that selector to the approved token for its role;
3. do not adjust layout or use `!important`;
4. add an assertion for any previously uncovered selector class that caused
   the mismatch.

- [ ] **Step 4: Run browser-level theme and geometry verification**

Run:

```powershell
node scripts/run-playwright.mjs tests/visual/theme.visual.spec.ts
npm.cmd run test:visual
npm.cmd run test:kits-visual
```

Expected: all visual tests PASS with no horizontal overflow or geometry
regression.

- [ ] **Step 5: Commit**

```powershell
git add tests/visual/theme.visual.spec.ts src/styles/catalog.css src/styles/responsive.css src/styles/about.css
git commit -m "test(theme): verify rendered color roles"
```

---

### Task 5: Certify the complete migration

**Files:**

- Modify only if verification exposes a defect: files already listed in Tasks 1–4 and their directly corresponding tests.

**Interfaces:**

- Consumes: completed theme migration and browser contracts.
- Produces: fresh evidence that the repository, static export, Catalog, Kits, Kit Builder, About, desktop, and mobile surfaces remain sound.

- [ ] **Step 1: Run static source audits**

Run:

```powershell
rg --pcre2 -n --glob 'src/**' -- '--color-page|--color-surface-primary|--color-surface-card|--color-surface-raised|--color-border(?!-)|--color-navigation-primary|--color-muted|--color-filled-control-text|--color-kind-extension|--color-kind-frontend|--color-kind-preset|--shadow-raised'
rg -n --glob 'src/**' '#07181d|#0b2229|#102b33|#173740|#284a52|#3b6068|#f3f1e8|#cbd6d3|#849a9e'
```

Expected: no matches.

- [ ] **Step 2: Run the complete repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
all Vitest tests, production build, and static-export verification PASS.

- [ ] **Step 3: Run complete Catalog and Kits browser suites**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run test:visual
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
```

Expected: all Playwright tests PASS.

- [ ] **Step 4: Inspect the production build at representative viewports**

Use the built static site or the repository's Playwright server and inspect:

- Catalog at `1440×1000` and `390×844`;
- Kits and open Kit Builder at `1440×1000` and `390×844`;
- About at desktop and mobile sizes;
- default, hover, focus-visible, pressed, pending selection, persistent In Kit,
  disabled, and overlay states.

Confirm:

- graphite hierarchy is visually legible;
- teal is the consistent general-interaction language;
- crimson, mint, and orange classification remains readable without full-card
  tinting;
- the Frontend crimson is not presented as an error;
- supplied text/background pairings remain legible;
- no first-paint flash shows the former canvas color.

- [ ] **Step 5: Commit verification corrections, if any**

If Steps 1–4 required code corrections, repeat every affected verification
command and commit only those corrections:

```powershell
git add src/styles/tokens.css src/app/layout.tsx src/app/globals.css src/styles/catalog.css src/styles/responsive.css src/styles/about.css scripts/audit-palette.mjs tests/unit/theme-token-contract.test.ts tests/unit/palette-audit.test.ts tests/unit/visual-alignment-contract.test.ts tests/visual/theme.visual.spec.ts
git commit -m "fix(theme): correct verified color roles"
```

If no correction was required, do not create an empty commit.

- [ ] **Step 6: Review final scope**

Run:

```powershell
git diff 863b1ea..HEAD --stat
git diff 863b1ea..HEAD -- src/styles src/app/layout.tsx scripts/audit-palette.mjs tests/unit/theme-token-contract.test.ts tests/unit/palette-audit.test.ts tests/unit/visual-alignment-contract.test.ts tests/visual/theme.visual.spec.ts
```

Expected: only the approved theme, audit, and verification surfaces changed;
no layout, copy, behavior, or artwork changes are present.
