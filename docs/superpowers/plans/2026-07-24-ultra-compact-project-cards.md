# Ultra-Compact Project Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace project-title action tooltips with complete summaries and reduce compact cards to their top facts row plus a single-line title.

**Architecture:** Keep `ProjectCard` as the single source of card semantics and use the existing body-level `compact-cards` class for presentation-only density changes. The title tooltip will own summary disclosure in both modes, while CSS will hide the compact card's secondary content without removing it from the card link's accessible description.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest, Testing Library, Playwright

## Global Constraints

- Standard cards retain their current visible summaries, state notes, metadata chips, licenses, community scores, repository sizes, preset sizes, activity, and last-commit ages.
- Compact cards retain only project identity, applicable activity/source facts, last-commit age, and project title.
- Compact titles are single-line and use an ellipsis when they overflow.
- Project-title tooltips expose the complete project summary on pointer hover and keyboard focus.
- The visible standard-card summary has no duplicate tooltip.
- The full project name and summary remain available to assistive technology.
- Existing tooltip portals, viewport positioning, Escape dismissal, and mobile suppression remain unchanged.
- The card remains a single external project link.
- Do not alter the approved production palette or add dependencies.
- Preserve the unrelated legal-footer changes already present in `src/features/catalog/components/filter-panel.tsx`, `src/styles/catalog.css`, and `tests/unit/visual-alignment-contract.test.ts`.

---

## File Map

- `src/features/catalog/components/project-card.tsx`: move full-summary disclosure to the title and render the visible standard summary as plain text.
- `src/components/ui/tooltip.tsx`: optionally expose a tooltip when its nearest interactive ancestor receives keyboard focus.
- `src/styles/catalog.css`: hide the complete compact bottom row and enforce the two-row ultra-compact title layout.
- `tests/e2e/catalog.spec.ts`: verify title summary tooltips and compact information visibility/height.
- `tests/unit/visual-alignment-contract.test.ts`: lock the compact CSS contract while preserving the in-progress legal-footer test.
- `tests/visual/catalog.visual.spec.ts-snapshots/catalog-desktop-compact-win32.png`: approved desktop compact reference.
- `tests/visual/catalog.visual.spec.ts-snapshots/catalog-mobile-compact-win32.png`: approved mobile compact reference.

### Task 1: Make the project title disclose the complete summary

**Files:**
- Modify: `tests/e2e/catalog.spec.ts:451-529`
- Modify: `src/components/ui/tooltip.tsx:31-96`
- Modify: `src/features/catalog/components/project-card.tsx:131-132,285-312`

**Interfaces:**
- Consumes: `CatalogProject.summary: string` and the existing `Tooltip` component.
- Produces: `Tooltip` prop `showOnAncestorFocus?: boolean`, which listens to the nearest `a` or `button` without adding a nested tab stop.
- Produces: `.card-title[aria-describedby]` whose tooltip label is `project.summary`; `.card-summary` remains visible standard text without its own tooltip anchor.

- [ ] **Step 1: Write the failing browser test**

In `tests/e2e/catalog.spec.ts`, remove `.card-summary-tooltip` from the list of tooltip-bearing facts and add these assertions to `explains every card fact with hover help`:

```ts
await expect(
  repositoryCard.locator(".card-summary-tooltip"),
).toHaveCount(0);
await repositoryCard.locator(".card-title").hover();
await expect(
  page.getByRole("tooltip", {
    name: "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
  }),
).toBeVisible();
await expect(
  page.getByRole("tooltip", { name: "Open Recursion" }),
).toHaveCount(0);
await page.keyboard.press("Escape");
await repositoryCard.focus();
await expect(
  page.getByRole("tooltip", {
    name: "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
  }),
).toBeVisible();
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- --grep "explains every card fact with hover help"
```

Expected: FAIL because `.card-summary-tooltip` still exists and `.card-title` still exposes `Open Recursion`.

- [ ] **Step 3: Add ancestor-focus support to the existing tooltip**

In `src/components/ui/tooltip.tsx`, add the optional prop and attach focus listeners directly to the closest interactive ancestor:

```tsx
export function Tooltip({
  id,
  label,
  children,
  className = "",
  style,
  showOnAncestorFocus = false,
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  showOnAncestorFocus?: boolean;
}) {
  useEffect(() => {
    if (!showOnAncestorFocus) return;
    const focusTarget = triggerRef.current?.closest("a, button");
    if (!focusTarget) return;

    focusTarget.addEventListener("focus", show);
    focusTarget.addEventListener("blur", hide);
    return () => {
      focusTarget.removeEventListener("focus", show);
      focusTarget.removeEventListener("blur", hide);
    };
  }, [hide, show, showOnAncestorFocus]);
}
```

This must not add `tabIndex` to `.card-title`; the card link remains the only tab stop.

- [ ] **Step 4: Implement the title-summary contract**

In `src/features/catalog/components/project-card.tsx`, remove `summaryId`, use the complete summary as the title tooltip label, and render the visible summary without a second tooltip:

```tsx
const titleId = `${project.id}-title`;

// ...

<h2>
  <Tooltip
    id={titleId}
    label={project.summary}
    className="card-title"
    showOnAncestorFocus
  >
    {project.name}
  </Tooltip>
</h2>
{details.length > 0 ? (
  <ul className="card-state-list" aria-label="Project details">
    {details.map((detail) => (
      <li className="card-state-note" key={detail}>
        {detail}
      </li>
    ))}
  </ul>
) : null}
<p className="card-summary">{project.summary}</p>
```

Do not change `cardDescription`; it must continue to expose the complete project facts to assistive technology.

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- --grep "explains every card fact with hover help"
```

Expected: 1 passed.

- [ ] **Step 6: Commit the semantic change**

```powershell
git add -- src/components/ui/tooltip.tsx src/features/catalog/components/project-card.tsx tests/e2e/catalog.spec.ts
git commit -m "feat: show summaries from card titles"
```

### Task 2: Reduce compact cards to the top row and title

**Files:**
- Modify: `tests/e2e/catalog.spec.ts:532-556`
- Modify: `tests/unit/visual-alignment-contract.test.ts:89-99`
- Modify: `src/styles/catalog.css:1090-1152`

**Interfaces:**
- Consumes: the existing `body.compact-cards` mode class and unchanged `ProjectCard` markup.
- Produces: hidden `.card-state-list`, `.card-summary`, `.community`, `.repository-size`, `.preset-size`, and `.card-bottom`; visible `.card-identity`, activity/source facts, `.commit-age`, and `.card-title`.

- [ ] **Step 1: Strengthen the failing compact browser contract**

Replace the compact test's chip-height assertion with explicit visibility and ellipsis assertions:

```ts
await expect(repositoryCard.locator(".card-summary")).toBeHidden();
await expect(repositoryCard.locator(".card-state-list")).toBeHidden();
await expect(repositoryCard.locator(".community")).toBeHidden();
await expect(repositoryCard.locator(".repository-size")).toBeHidden();
await expect(repositoryCard.locator(".card-chips")).toBeHidden();
await expect(repositoryCard.locator(".license")).toBeHidden();
await expect(repositoryCard.locator(".activity-score")).toBeVisible();
await expect(repositoryCard.locator(".commit-age")).toBeVisible();
await expect(repositoryCard.locator(".card-identity")).toBeVisible();
await expect(repositoryCard.locator(".card-title")).toBeVisible();
await expect(presetCard.locator(".preset-size")).toBeHidden();
await expect(repositoryCard.locator(".card-title")).toHaveCSS(
  "white-space",
  "nowrap",
);
await expect(repositoryCard.locator(".card-title")).toHaveCSS(
  "text-overflow",
  "ellipsis",
);
await expect(repositoryCard.locator(".card-title")).toHaveCSS(
  "overflow",
  "hidden",
);
expect((await repositoryCard.boundingBox())!.height).toBeLessThan(90);
```

After switching to compact mode, hover `.card-title` and verify that the complete Recursion summary remains available:

```ts
await repositoryCard.locator(".card-title").hover();
await expect(
  page.getByRole("tooltip", {
    name: "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
  }),
).toBeVisible();
```

- [ ] **Step 2: Add the failing static CSS contract**

In `tests/unit/visual-alignment-contract.test.ts`, replace the current compact hide-selector expectation with:

```ts
expect(css).toMatch(
  /\.compact-cards \.community,[\s\S]*?\.compact-cards \.card-summary,[\s\S]*?\.compact-cards \.card-bottom\s*\{[^}]*display:\s*none/s,
);
expect(css).toMatch(
  /\.compact-cards \.card-title\s*\{[^}]*display:\s*block[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s,
);
```

Retain the uncommitted `filter-legal` test in the same file exactly as it exists.

- [ ] **Step 3: Run both tests to verify they fail**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:e2e -- --grep "substantially reduces cards in compact mode"
```

Expected: the unit test FAILS because `.card-bottom` and `.card-title` lack the new compact rules; the browser test FAILS because chips and license remain visible and the card is at least 90px tall.

- [ ] **Step 4: Implement the ultra-compact CSS**

In `src/styles/catalog.css`, keep the existing compact top-row sizing and replace the compact hide/title/bottom rules with:

```css
.compact-cards .community,
.compact-cards .repository-size,
.compact-cards .preset-size,
.compact-cards .card-state-list,
.compact-cards .card-summary,
.compact-cards .card-bottom {
  display: none;
}

.compact-cards .project-card h2 {
  min-width: 0;
  margin: 8px 0 0;
  font-size: 15px;
}

.compact-cards .card-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Delete the obsolete compact `.card-bottom` and `.card-chips` layout blocks. Do not modify the earlier `.filter-legal` rules.

- [ ] **Step 5: Run focused tests to verify they pass**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:e2e -- --grep "substantially reduces cards in compact mode"
```

Expected: both focused suites pass, the compact Recursion card is under 90px tall, and its title reveals the full summary.

- [ ] **Step 6: Commit the compact layout**

```powershell
git add -- src/styles/catalog.css tests/unit/visual-alignment-contract.test.ts tests/e2e/catalog.spec.ts
git commit -m "feat: make compact cards ultra dense"
```

### Task 3: Refresh visual references and complete verification

**Files:**
- Modify: `tests/visual/catalog.visual.spec.ts-snapshots/catalog-desktop-compact-win32.png`
- Modify: `tests/visual/catalog.visual.spec.ts-snapshots/catalog-mobile-compact-win32.png`

**Interfaces:**
- Consumes: completed title-tooltip and compact-layout behavior from Tasks 1 and 2.
- Produces: reviewed desktop and mobile compact visual baselines plus a fully verified static export.

- [ ] **Step 1: Run the visual suite and verify only compact references fail**

```powershell
npm.cmd run test:visual
```

Expected: the desktop and mobile compact snapshots fail because cards are shorter; standard catalog and reference-alignment tests pass.

- [ ] **Step 2: Regenerate only the intended compact snapshots**

```powershell
npm.cmd run test:visual -- --update-snapshots --grep "compact catalog surface"
```

Expected: `catalog-desktop-compact-win32.png` and `catalog-mobile-compact-win32.png` are regenerated.

- [ ] **Step 3: Visually inspect both regenerated references**

Open both PNGs and confirm:

- each card contains only the top identity/activity row and one title row;
- long titles remain on one line and end with an ellipsis;
- no chips, licenses, descriptions, scores, or sizes remain;
- cards align consistently without clipped top-row facts; and
- no colors outside the approved palette appear.

- [ ] **Step 4: Run the complete verification gate**

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
git diff --check
```

Expected:

- format, lint, palette audit, catalog validation/build, typecheck, unit tests, production build, and static-export verification pass;
- all browser tests pass;
- all visual tests pass; and
- `git diff --check` reports no whitespace errors.

- [ ] **Step 5: Review the final diff for scope**

```powershell
git diff --stat HEAD~2
git diff HEAD~2 -- src/components/ui/tooltip.tsx src/features/catalog/components/project-card.tsx src/styles/catalog.css tests/e2e/catalog.spec.ts tests/unit/visual-alignment-contract.test.ts
git status --short
```

Expected: only title-tooltip behavior, compact-card presentation/tests, two compact snapshots, and the pre-existing legal-footer changes are present. Do not stage or commit the legal-footer plan or implementation as part of this feature.

- [ ] **Step 6: Commit the reviewed visual baselines**

```powershell
git add -- tests/visual/catalog.visual.spec.ts-snapshots/catalog-desktop-compact-win32.png tests/visual/catalog.visual.spec.ts-snapshots/catalog-mobile-compact-win32.png
git commit -m "test: update ultra compact card visuals"
```

- [ ] **Step 7: Run final post-commit verification**

```powershell
npm.cmd run test:e2e
npm.cmd run test:visual
git status --short
```

Expected: 29 browser tests and 10 visual tests pass; `git status --short` lists only the preserved legal-footer work.
