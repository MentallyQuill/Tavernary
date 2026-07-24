# Catalog Filter and Aging Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vocabulary-driven frontend expansion, theme-colored project-kind controls, continuous commit aging, teal open-source licenses, smaller inkwell geometry, and viewport-safe tile tooltips.

**Architecture:** Keep filter vocabulary in `data/vocabularies/frontends.json`, isolate commit freshness and tooltip placement as pure tested helpers, and render visible tooltip bubbles through a document-level React portal. Existing catalog components consume those small interfaces without changing the catalog schema.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS custom properties and `color-mix()`, Vitest, Playwright.

## Global Constraints

- The collapsed frontend order is SillyTavern, Lumiverse, Marinara Engine.
- Known frontends remain selectable with a `0` project count.
- Commit age is teal at 0 days, muted gray at 30 or more days, and linearly mixed between them.
- OSI-approved licenses are teal; proprietary and missing licenses remain muted gray.
- Desktop inkwell geometry is 34px by 45px; mobile is 31px by 41px; both shift 12px left.
- Visible tooltips stay at least 8px inside the viewport and are not clipped by tiles.
- Floating tooltip bubbles remain disabled at widths of 760px or less.
- Use red-green-refactor for every behavior change.

---

### Task 1: Vocabulary-driven frontend expansion

**Files:**
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/styles/catalog.css`
- Test: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: `data/vocabularies/frontends.json` entries in source order
- Produces: `FilterGroup` props `collapsedLimit?: number` and vocabulary-backed frontend options

- [ ] **Step 1: Write the failing browser test**

Extend the desktop filter test with a fieldset-scoped contract:

```ts
const frontendGroup = page
  .locator("fieldset.filter-group")
  .filter({ has: page.getByText("Compatible frontend", { exact: true }) });

const visibleNames = async () =>
  frontendGroup.locator("label:visible > span").allTextContents();

expect(await visibleNames()).toEqual([
  "SillyTavern",
  "Lumiverse",
  "Marinara Engine",
]);
await expect(
  frontendGroup.getByLabel("Lumiverse").locator("..").locator("b"),
).toHaveText("0");
await expect(frontendGroup.getByLabel("Sonder Engine")).toBeHidden();
await expect(
  frontendGroup.getByRole("button", { name: "Show 1 more" }),
).toBeVisible();

await frontendGroup.getByRole("button", { name: "Show 1 more" }).click();
await expect(frontendGroup.getByLabel("Sonder Engine")).toBeVisible();
await expect(
  frontendGroup.getByRole("button", { name: "Show fewer" }),
).toBeVisible();
```

Also cover search and selected-extra behavior:

```ts
await frontendGroup.getByRole("button", { name: "Show fewer" }).click();
await page
  .getByRole("searchbox", { name: "Search compatible frontends" })
  .fill("Sonder");
await expect(frontendGroup.getByLabel("Sonder Engine")).toBeVisible();
await page
  .getByRole("searchbox", { name: "Search compatible frontends" })
  .fill("");
await frontendGroup.getByRole("button", { name: "Show 1 more" }).click();
await frontendGroup.getByLabel("Sonder Engine").check();
await frontendGroup.getByRole("button", { name: "Show fewer" }).click();
await expect(frontendGroup.getByLabel("Sonder Engine")).toBeVisible();
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- --grep "approved desktop filter controls"
```

Expected: FAIL because Lumiverse and Sonder are absent from project-derived options and there is no expansion control.

- [ ] **Step 3: Import canonical frontend options**

In `filter-panel.tsx`:

```ts
import frontendVocabulary from "../../../../data/vocabularies/frontends.json";

const frontendOptions = frontendVocabulary.frontends.map(({ id, label }) => ({
  id,
  label,
}));
```

Replace `options={uniqueLabels(projects, "frontends")}` with:

```tsx
options={frontendOptions}
collapsedLimit={3}
```

- [ ] **Step 4: Add reusable collapsed-list behavior**

Add `collapsedLimit?: number` to `FilterGroup`, local `expanded` state, and compute displayed options:

```ts
const searchedOptions = normalizedSearch
  ? options.filter(({ label }) =>
      label.toLocaleLowerCase().includes(normalizedSearch),
    )
  : options;
const collapsedOptions =
  collapsedLimit === undefined || normalizedSearch || expanded
    ? searchedOptions
    : searchedOptions.filter(
        (option, index) =>
          index < collapsedLimit || selected.includes(option.id),
      );
const hiddenCount = searchedOptions.length - collapsedOptions.length;
```

Render `collapsedOptions`. After the list, render:

```tsx
{collapsedLimit !== undefined &&
normalizedSearch === "" &&
(expanded || hiddenCount > 0) ? (
  <button
    className="filter-expand"
    type="button"
    aria-expanded={expanded}
    onClick={() => setExpanded((value) => !value)}
  >
    {expanded ? "Show fewer" : `Show ${hiddenCount} more`}
  </button>
) : null}
```

- [ ] **Step 5: Style the expansion control**

Add:

```css
.filter-expand {
  width: 100%;
  min-height: 27px;
  border: 0;
  padding: 3px 0 0 23px;
  color: var(--color-muted);
  background: transparent;
  cursor: pointer;
  font-size: 10px;
  text-align: left;
}

.filter-expand:hover {
  color: var(--color-text-secondary);
}
```

- [ ] **Step 6: Build and rerun the focused test**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- --grep "approved desktop filter controls"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/features/catalog/components/filter-panel.tsx src/styles/catalog.css tests/e2e/catalog.spec.ts
git commit -m "feat(filters): expand frontend vocabulary"
```

### Task 2: Theme project-kind checkboxes

**Files:**
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/styles/catalog.css`
- Test: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: `FilterGroup.group === "kinds"` and `option.id`
- Produces: `.kind-option[data-kind="<kind>"]` CSS hook and `--checkbox-color`

- [ ] **Step 1: Write the failing computed-style test**

Add:

```ts
const kindColors = {
  Frontend: "rgb(214, 40, 57)",
  Extension: "rgb(225, 138, 36)",
  "System Preset": "rgb(87, 197, 163)",
};
for (const [label, color] of Object.entries(kindColors)) {
  const checkbox = page.getByLabel(label, { exact: true });
  await expect(checkbox).toHaveCSS("border-top-color", color);
  await checkbox.check();
  await expect(checkbox).toHaveCSS("background-color", color);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd run test:e2e -- --grep "approved desktop filter controls"
```

Expected: FAIL because native checkbox borders do not use kind-specific colors.

- [ ] **Step 3: Add kind hooks**

For list presentation labels:

```tsx
<label
  className={group === "kinds" ? "kind-option" : undefined}
  data-kind={group === "kinds" ? option.id : undefined}
  key={option.id}
>
```

- [ ] **Step 4: Implement the custom checkbox style**

Add:

```css
.kind-option[data-kind="frontend"] {
  --checkbox-color: var(--color-kind-frontend);
}

.kind-option[data-kind="extension"] {
  --checkbox-color: var(--color-kind-extension);
}

.kind-option[data-kind="preset"] {
  --checkbox-color: var(--color-kind-preset);
}

.filter-group .kind-option input[type="checkbox"] {
  display: grid;
  appearance: none;
  border: 1px solid var(--checkbox-color);
  border-radius: 2px;
  background: transparent;
  place-content: center;
}

.filter-group .kind-option input[type="checkbox"]:checked {
  background: var(--checkbox-color);
}

.filter-group .kind-option input[type="checkbox"]:checked::before {
  width: 7px;
  height: 4px;
  border-bottom: 2px solid var(--color-page);
  border-left: 2px solid var(--color-page);
  content: "";
  transform: translateY(-1px) rotate(-45deg);
}
```

- [ ] **Step 5: Rerun the focused test**

Run:

```powershell
npm.cmd run test:e2e -- --grep "approved desktop filter controls"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/features/catalog/components/filter-panel.tsx src/styles/catalog.css tests/e2e/catalog.spec.ts
git commit -m "style(filters): theme project-kind controls"
```

### Task 3: Continuous commit aging and license colors

**Files:**
- Create: `src/features/catalog/commit-freshness.ts`
- Create: `tests/unit/commit-freshness.test.ts`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Produces: `daysSince(timestamp: string | null, now: string): number | null`
- Produces: `commitFreshnessPercent(timestamp: string | null, now: string): number`
- Consumes: CSS custom property `--commit-freshness`

- [ ] **Step 1: Write failing pure-function tests**

Create:

```ts
import { describe, expect, test } from "vitest";

import {
  commitFreshnessPercent,
  daysSince,
} from "@/features/catalog/commit-freshness";

const now = "2026-07-31T00:00:00Z";

describe("commit freshness", () => {
  test.each([
    ["2026-07-31T00:00:00Z", 0, 100],
    ["2026-07-16T00:00:00Z", 15, 50],
    ["2026-07-01T00:00:00Z", 30, 0],
    ["2026-06-01T00:00:00Z", 60, 0],
  ])("%s maps to %i days and %i percent", (timestamp, days, percent) => {
    expect(daysSince(timestamp, now)).toBe(days);
    expect(commitFreshnessPercent(timestamp, now)).toBe(percent);
  });

  test("missing activity is fully muted", () => {
    expect(daysSince(null, now)).toBeNull();
    expect(commitFreshnessPercent(null, now)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run:

```powershell
npm.cmd test -- tests/unit/commit-freshness.test.ts --run
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure helper**

Create:

```ts
const DAY_MS = 24 * 60 * 60 * 1000;
const AGING_DAYS = 30;

export function daysSince(timestamp: string | null, now: string) {
  if (!timestamp) return null;
  return Math.max(
    0,
    Math.floor(
      (new Date(now).getTime() - new Date(timestamp).getTime()) / DAY_MS,
    ),
  );
}

export function commitFreshnessPercent(
  timestamp: string | null,
  now: string,
) {
  const days = daysSince(timestamp, now);
  if (days === null) return 0;
  return Math.max(0, Math.min(100, (1 - days / AGING_DAYS) * 100));
}
```

- [ ] **Step 4: Use the helper in cards**

Import `CSSProperties`, `daysSince`, and `commitFreshnessPercent`. Replace the date arithmetic in `relativeTime` with `daysSince`. Build the style:

```ts
const commitFreshness = commitFreshnessPercent(
  project.activity.latestMeaningfulCommitAt,
  now,
);
const commitAgeStyle = {
  "--commit-freshness": `${commitFreshness}%`,
} as CSSProperties;
```

Apply `style={commitAgeStyle}` to `.commit-age` and remove the conditional `dormant` class.

- [ ] **Step 5: Add CSS aging and license rules**

Replace the dormant rule and commit-age color with:

```css
.commit-age {
  grid-column: 2;
  grid-row: 1;
  color: color-mix(
    in srgb,
    var(--color-kind-preset) var(--commit-freshness),
    var(--color-muted)
  );
  font-weight: 700;
}
```

Change:

```css
.license-osi-approved {
  color: var(--color-kind-preset);
}

.license-proprietary,
.license-missing {
  color: var(--color-muted);
}
```

Keep the separate `.license-missing` underline declarations.

- [ ] **Step 6: Add browser assertions**

In the card anatomy/tooltip tests:

```ts
await expect(recursion.locator(".commit-age")).toHaveCSS(
  "--commit-freshness",
  `${(29 / 30) * 100}%`,
);
await expect(
  page.locator(".project-card").filter({ hasText: "Stab's Directives" }).locator(".commit-age"),
).toHaveCSS("--commit-freshness", "0%");
await expect(recursion.locator(".license-osi-approved")).toHaveCSS(
  "color",
  "rgb(87, 197, 163)",
);
await expect(
  page.locator(".project-card").filter({ hasText: "Purrfect Logic" }).locator(".license-missing"),
).toHaveCSS("color", "rgb(111, 126, 130)");
```

Use the catalog’s deterministic generated `now` when calculating the exact Recursion percentage in the test; do not hardcode a value that disagrees with fixture dates.

- [ ] **Step 7: Run focused verification**

Run:

```powershell
npm.cmd test -- tests/unit/commit-freshness.test.ts --run
npm.cmd run build
npm.cmd run test:e2e -- --grep "card anatomy|card fact"
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/features/catalog/commit-freshness.ts src/features/catalog/components/project-card.tsx src/styles/catalog.css tests/unit/commit-freshness.test.ts tests/e2e/catalog.spec.ts
git commit -m "feat(cards): add continuous activity aging"
```

### Task 4: Resize and reposition the inkwell

**Files:**
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Produces: desktop `.brand-logo` geometry 34px by 45px
- Produces: mobile `.brand-logo` geometry 31px by 41px

- [ ] **Step 1: Write failing CSS and browser contracts**

Add unit contracts:

```ts
expect(css).toMatch(
  /\.brand-logo\s*\{[^}]*width:\s*34px[^}]*height:\s*45px[^}]*transform:\s*translateX\(-12px\)/s,
);
expect(responsive).toMatch(
  /@media \(max-width:\s*760px\)[\s\S]*?\.brand-logo\s*\{[^}]*width:\s*31px[^}]*height:\s*41px[^}]*transform:\s*translateX\(-12px\)/,
);
```

Add computed mobile assertions:

```ts
const logo = page.locator(".brand-logo");
await expect(logo).toHaveCSS("width", "31px");
await expect(logo).toHaveCSS("height", "41px");
await expect(logo).toHaveCSS("transform", /matrix\(1, 0, 0, 1, -12, 0\)/);
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts --run
npm.cmd run test:e2e -- tests/e2e/mobile.spec.ts
```

Expected: FAIL with old 45x60 desktop and 41x55 mobile geometry.

- [ ] **Step 3: Implement exact geometry**

Desktop:

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

- [ ] **Step 4: Rerun focused tests**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts --run
npm.cmd run build
npm.cmd run test:e2e -- tests/e2e/mobile.spec.ts
```

Expected: PASS with no header overlap or horizontal overflow.

- [ ] **Step 5: Commit**

```powershell
git add src/styles/catalog.css src/styles/responsive.css tests/unit/visual-alignment-contract.test.ts tests/e2e/mobile.spec.ts
git commit -m "style(header): resize Tavernary inkwell"
```

### Task 5: Render viewport-safe tooltip portals

**Files:**
- Create: `src/components/ui/tooltip-position.ts`
- Create: `tests/unit/tooltip-position.test.ts`
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Produces: `computeTooltipPosition(trigger, tooltip, viewport): { left: number; top: number; placement: "above" | "below" }`
- Consumes: stable tooltip `id`, `label`, `children`, and optional `className`
- Removes: `Tooltip.align`

- [ ] **Step 1: Write failing position tests**

Create:

```ts
import { describe, expect, test } from "vitest";

import { computeTooltipPosition } from "@/components/ui/tooltip-position";

const viewport = { width: 800, height: 600, margin: 8, gap: 8 };
const tooltip = { width: 240, height: 48 };

describe("tooltip positioning", () => {
  test("clamps a left-edge trigger", () => {
    expect(
      computeTooltipPosition(
        { left: 0, right: 40, top: 100, bottom: 120, width: 40, height: 20 },
        tooltip,
        viewport,
      ),
    ).toEqual({ left: 8, top: 44, placement: "above" });
  });

  test("clamps a right-edge trigger", () => {
    expect(
      computeTooltipPosition(
        { left: 770, right: 800, top: 100, bottom: 120, width: 30, height: 20 },
        tooltip,
        viewport,
      ).left,
    ).toBe(552);
  });

  test("flips below a top-edge trigger", () => {
    expect(
      computeTooltipPosition(
        { left: 300, right: 340, top: 20, bottom: 40, width: 40, height: 20 },
        tooltip,
        viewport,
      ),
    ).toEqual({ left: 200, top: 48, placement: "below" });
  });
});
```

- [ ] **Step 2: Run the unit test to verify failure**

Run:

```powershell
npm.cmd test -- tests/unit/tooltip-position.test.ts --run
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the pure position helper**

Create rectangle/viewport interfaces and:

```ts
export function computeTooltipPosition(
  trigger: TooltipRect,
  tooltip: Pick<TooltipRect, "width" | "height">,
  viewport: TooltipViewport,
) {
  const centered = trigger.left + trigger.width / 2 - tooltip.width / 2;
  const left = Math.max(
    viewport.margin,
    Math.min(centered, viewport.width - tooltip.width - viewport.margin),
  );
  const above = trigger.top - tooltip.height - viewport.gap;
  if (above >= viewport.margin) {
    return { left, top: above, placement: "above" as const };
  }
  return {
    left,
    top: Math.max(
      viewport.margin,
      Math.min(
        trigger.bottom + viewport.gap,
        viewport.height - tooltip.height - viewport.margin,
      ),
    ),
    placement: "below" as const,
  };
}
```

- [ ] **Step 4: Write the portal component**

Add `"use client"`, `createPortal`, refs, state, and effects. The public signature becomes:

```ts
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
})
```

The trigger:

```tsx
<span
  ref={triggerRef}
  className={`tooltip-anchor ${className}`}
  aria-describedby={id}
  onPointerEnter={() => setOpen(true)}
  onPointerLeave={() => setOpen(false)}
  onFocusCapture={() => setOpen(true)}
  onBlurCapture={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }}
>
  {children}
</span>
```

Use these state and positioning effects:

```ts
const triggerRef = useRef<HTMLSpanElement>(null);
const tooltipRef = useRef<HTMLSpanElement>(null);
const [open, setOpen] = useState(false);
const [position, setPosition] = useState<ReturnType<
  typeof computeTooltipPosition
> | null>(null);

const show = () => {
  setPosition(null);
  setOpen(true);
};

const updatePosition = useCallback(() => {
  const trigger = triggerRef.current;
  const tooltip = tooltipRef.current;
  if (!trigger || !tooltip) return;
  setPosition(
    computeTooltipPosition(
      trigger.getBoundingClientRect(),
      tooltip.getBoundingClientRect(),
      {
        width: window.innerWidth,
        height: window.innerHeight,
        margin: 8,
        gap: 8,
      },
    ),
  );
}, []);

useLayoutEffect(() => {
  if (open) updatePosition();
}, [open, updatePosition]);

useEffect(() => {
  if (!open) return;
  const reposition = () => updatePosition();
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  return () => {
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
  };
}, [open, updatePosition]);
```

Use `show` for pointer entry and focus capture, and `setOpen(false)` for pointer leave and blur outside.

When open, portal:

```tsx
{open && typeof document !== "undefined"
  ? createPortal(
      <span
        ref={tooltipRef}
        className="tooltip-portal"
        data-placement={position?.placement}
        id={id}
        role="tooltip"
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          visibility: position ? "visible" : "hidden",
        }}
      >
        {label}
      </span>,
      document.body,
    )
  : null}
```

Use `useLayoutEffect` to call `updatePosition()` after the portal mounts. While open, register `resize` and capture-phase `scroll`; remove both listeners in cleanup.

- [ ] **Step 5: Remove local alignment and overflow workarounds**

Delete every `align="left"` use in `project-card.tsx`. In CSS:

```css
.project-card {
  overflow: hidden;
}

.project-card:hover,
.project-card:focus-visible {
  /* no overflow or z-index exceptions */
}

.tooltip-anchor {
  position: relative;
}

.tooltip-portal {
  position: fixed;
  z-index: 1000;
  width: max-content;
  max-width: min(240px, calc(100vw - 16px));
  border: 1px solid var(--color-border-strong);
  border-radius: 5px;
  padding: 7px 9px;
  color: var(--color-text-secondary);
  background: #06171b;
  box-shadow: var(--shadow-raised);
  font-size: 9px;
  font-weight: 500;
  line-height: 1.4;
  pointer-events: none;
  white-space: normal;
}
```

Delete `.tooltip-content`, `.tooltip-align-left`, and descendant hover/focus rules. Change the mobile rule from `.tooltip-content` to `.tooltip-portal`.

- [ ] **Step 6: Update browser tests for portals and clipping**

Replace card-descendant tooltip lookups with the `aria-describedby` ID:

```ts
async function hoverAndReadTooltip(anchor: Locator) {
  const id = await anchor.getAttribute("aria-describedby");
  expect(id).toBeTruthy();
  await anchor.hover();
  const tooltip = page.locator(`#${id}`);
  await expect(tooltip).toBeVisible();
  return tooltip;
}
```

For leftmost community, rightmost repository size, top-row activity, and bottom-row license anchors:

```ts
const box = await (await hoverAndReadTooltip(anchor)).boundingBox();
expect(box).not.toBeNull();
expect(box!.x).toBeGreaterThanOrEqual(8);
expect(box!.y).toBeGreaterThanOrEqual(8);
expect(box!.x + box!.width).toBeLessThanOrEqual(
  page.viewportSize()!.width - 8,
);
expect(box!.y + box!.height).toBeLessThanOrEqual(
  page.viewportSize()!.height - 8,
);
```

Also assert:

```ts
expect(
  await page.evaluate(() => document.documentElement.scrollWidth),
).toBe(await page.evaluate(() => document.documentElement.clientWidth));
```

- [ ] **Step 7: Run focused unit and browser verification**

Run:

```powershell
npm.cmd test -- tests/unit/tooltip-position.test.ts --run
npm.cmd run build
npm.cmd run test:e2e -- --grep "explains every card fact"
```

Expected: PASS, including the community-score tooltip shown in the user screenshot.

- [ ] **Step 8: Commit**

```powershell
git add src/components/ui/tooltip-position.ts src/components/ui/tooltip.tsx src/features/catalog/components/project-card.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/tooltip-position.test.ts tests/e2e/catalog.spec.ts
git commit -m "fix(tooltips): escape tile clipping"
```

### Task 6: Full verification and visual examination

**Files:**
- Update only if intentional: `tests/visual/catalog.visual.spec.ts-snapshots/*.png`

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified branch ready for integration

- [ ] **Step 1: Run the complete repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, validation, catalog build, typecheck, 57 or more unit tests, production build, and static-export verification all pass.

- [ ] **Step 2: Run every browser test**

Run:

```powershell
npm.cmd run test:e2e
```

Expected: all tests pass with no page overflow or clipped tooltip rectangles.

- [ ] **Step 3: Run visual regression before updating snapshots**

Run:

```powershell
npm.cmd run test:visual
```

Expected: reference profile/layout tests pass. Pixel snapshots may differ only for the frontend filter, checkbox colors, aging/license colors, and inkwell geometry.

- [ ] **Step 4: Inspect desktop, tablet, mobile, and hovered-tooltip renders**

Confirm visually:

- top-three frontend order and expansion control;
- zero-count Lumiverse row;
- red/orange/teal project-kind checkbox outlines;
- teal-to-gray commit-age progression;
- teal OSI-approved licenses;
- smaller inkwell located closer to the wordmark;
- community tooltip fully visible and at least 8px inside the viewport;
- no new overlap, clipping, or horizontal scrolling.

- [ ] **Step 5: Update intentional snapshots and rerun**

Run:

```powershell
npm.cmd run test:visual -- --update-snapshots
npm.cmd run test:visual
```

Expected: all visual checks pass on the updated reviewed baselines.

- [ ] **Step 6: Final diff and worktree checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only the planned files/snapshots are modified.

- [ ] **Step 7: Commit reviewed snapshots if changed**

```powershell
git add tests/visual/catalog.visual.spec.ts-snapshots
git commit -m "test(visual): accept catalog polish"
```

Skip this commit when no snapshot changed.
