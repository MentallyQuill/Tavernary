# Neutral Activity Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project activity visibly factual and neutral by replacing the weekly ratio with `Activity`, using title-white active bars, and fading recency from title-white to gray over one month.

**Architecture:** Keep all activity evidence and tooltip construction in `ProjectCard` unchanged. Change only the visible label and the two CSS color endpoints, with unit, CSS-contract, and real-browser assertions proving the behavior.

**Tech Stack:** React 19, TypeScript, CSS custom properties, Vitest, Testing Library, Playwright

## Global Constraints

- The visible activity label is exactly `Activity` for complete, provisional, and degraded evidence.
- Active weekly bars use `--color-text-primary`.
- Inactive and provisional bars keep their existing neutral gray treatments.
- Recency fades from `--color-text-primary` at current freshness to `--color-activity-recent` at one month.
- Tooltip copy, accessible labels, twelve-week evidence, sorting, and TavernKeeper scan presentation remain unchanged.

---

### Task 1: Neutral project-card activity presentation

**Files:**
- Modify: `tests/unit/project-card.test.tsx`
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/visual/theme.visual.spec.ts`
- Modify: `tests/visual/catalog.visual.spec.ts`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/styles/catalog.css`

**Interfaces:**
- Consumes: `CatalogProject.activity`, `ActivitySparkline`, `--color-text-primary`, and `--color-activity-recent`.
- Produces: the existing `.activity-score`, `.activity-weeks i.active`, and `.commit-age` elements with neutral visible presentation.

- [ ] **Step 1: Write failing visible-copy and CSS-contract tests**

Change the project-card assertion so the rendered visible text is `Activity`, the ratio is absent, and the detailed accessible label remains:

```tsx
expect(screen.getByText("Activity")).toBeInTheDocument();
expect(screen.queryByText("5/12")).not.toBeInTheDocument();
expect(
  screen.getByLabelText("Source activity in 5 of the last 12 weeks"),
).toBeInTheDocument();
```

Change the style-contract assertions to require the neutral endpoints:

```ts
expect(css).toMatch(
  /\.activity-weeks i\.active\s*\{[^}]*background:\s*var\(--color-text-primary\)/s,
);
expect(css).toMatch(
  /\.commit-age\s*\{[^}]*color:\s*color-mix\([\s\S]*?var\(--color-text-primary\) var\(--commit-freshness\),[\s\S]*?var\(--color-activity-recent\)/s,
);
```

- [ ] **Step 2: Run the focused unit tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-card.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because the card still renders `5/12`, active bars still use `--color-activity-current`, and recency still starts from `--color-activity-current`.

- [ ] **Step 3: Implement the minimal component and CSS changes**

Replace the visible ratio in `ProjectCard` while retaining its tooltip wrapper and labels:

```tsx
<b>Activity</b>
```

Use the established neutral tokens in `catalog.css`:

```css
.activity-weeks i.active {
  background: var(--color-text-primary);
}

.commit-age {
  color: color-mix(
    in srgb,
    var(--color-text-primary) var(--commit-freshness),
    var(--color-activity-recent)
  );
}
```

Do not change `.evidence-provisional .activity-weeks i.active`, which must continue overriding active bars with neutral gray.

- [ ] **Step 4: Run the focused unit tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-card.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: both files PASS with no warnings.

- [ ] **Step 5: Add real-browser color and responsive-copy coverage**

Update the existing semantic-color fixture in `theme.visual.spec.ts` to include current and stale recency examples:

```html
<span class="commit-age" data-recency="current" style="--commit-freshness: 100%">Today</span>
<span class="commit-age" data-recency="stale" style="--commit-freshness: 0%">1mo ago</span>
```

Assert the computed active-bar and recency endpoints:

```ts
await expectStyle(weeks.nth(0), "background-color", graphiteTeal.secondaryText);
await expectStyle(
  fixture.locator('[data-recency="current"]'),
  "color",
  graphiteTeal.secondaryText,
);
await expectStyle(
  fixture.locator('[data-recency="stale"]'),
  "color",
  graphiteTeal.activityRecent,
);
```

Update the catalog screenshot stabilizer to set both activity labels to `Activity`, matching production rather than restoring synthetic ratios. Extend the existing mobile activity test with:

```ts
await expect(card.locator(".activity-score > b")).toHaveText("Activity");
```

- [ ] **Step 6: Run browser and visual verification**

Run:

```powershell
npm.cmd run test:e2e -- --project=chromium tests/e2e/catalog.spec.ts --grep "keeps repository activity facts visible on mobile cards"
npm.cmd run test:visual -- tests/visual/theme.visual.spec.ts tests/visual/catalog.visual.spec.ts
```

Expected: mobile copy and computed colors PASS; visual snapshots either remain stable after deterministic labels or are intentionally updated only for the approved activity presentation.

- [ ] **Step 7: Run repository-wide verification**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, security validation, typecheck, unit tests, production build, and static-export verification all PASS.

- [ ] **Step 8: Commit the implementation**

```powershell
git add src/features/catalog/components/project-card.tsx src/styles/catalog.css tests/unit/project-card.test.tsx tests/unit/visual-alignment-contract.test.ts tests/visual/theme.visual.spec.ts tests/visual/catalog.visual.spec.ts tests/e2e/catalog.spec.ts
git commit -m "fix(ui): neutralize activity signal"
```

- [ ] **Step 9: Publish, validate CI, and merge**

Push `codex/neutral-activity-indicator`, open a pull request against `main`, wait for every required GitHub Actions check to complete successfully, then merge without bypassing branch protections. Confirm the merged commit is present on remote `main`.
