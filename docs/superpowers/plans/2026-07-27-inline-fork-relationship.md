# Inline Fork Relationship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep forked and ordinary project cards the same height by presenting `License · Fork of Parent` in the existing left-weighted utility row.

**Architecture:** Keep the relationship control outside the repository link to avoid nested interactive elements. For fork cards, render the shared license display inside the absolutely overlaid relationship control while leaving the card's utility row as its height reservation; ordinary cards continue rendering the license inside the card.

**Tech Stack:** React 19, TypeScript, CSS, Vitest with Testing Library, Playwright.

## Global Constraints

- The utility sequence is `AGPL-3.0 · Fork of SillyTavern`.
- `Fork of {parent}` is the only published-relationship action; there is no `View relationship` text.
- The relationship favors the left side and remains clear of the far-right Kit control.
- Fork cards and ordinary cards retain equal heights.
- Long parent names truncate without horizontal overflow.
- Do not commit implementation changes unless the user explicitly requests a commit.

---

### Task 1: Inline relationship semantics and shared license display

**Files:**
- Modify: `tests/unit/project-card.test.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/features/catalog/components/project-grid.tsx`
- Modify: `src/features/catalog/components/project-relationship-control.tsx`

**Interfaces:**
- `ProjectCard` gains `licensePlacement?: "card" | "relationship"` and renders an empty `.card-utility` reservation when placement is `"relationship"`.
- `ProjectLicense({ project }: { project: CatalogProject })` is exported from `project-card.tsx`.
- `ProjectRelationshipControl` gains `license: ReactNode` and lays out the license, decorative separator, and relationship label.

- [ ] **Step 1: Write the failing component test**

Update the published-fork test to assert:

```tsx
const control = container.querySelector(".project-relationship-control");
expect(control?.children[0]).toHaveClass("license");
expect(control?.children[1]).toHaveTextContent("·");
expect(control?.children[2]).toHaveTextContent("Fork of VectHare");
expect(
  screen.getByRole("button", {
    name: "View relationship between VectHare and VectFox",
  }),
).toHaveTextContent("Fork of VectHare");
expect(screen.queryByText("View relationship")).not.toBeInTheDocument();
expect(
  container.querySelector(".project-card .card-utility .license"),
).not.toBeInTheDocument();
```

Production mutation caught: restoring the standalone action, omitting the
license from the fork utility sequence, or rendering two licenses makes this
test fail.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-card.test.tsx
```

Expected: FAIL because the current relationship control begins with the fork
origin and still renders the separate `View relationship` action.

- [ ] **Step 3: Implement the minimal semantic change**

Export the existing license tooltip rendering as:

```tsx
export function ProjectLicense({ project }: { project: CatalogProject }) {
  return (
    <Tooltip
      id={`${project.id}-license`}
      label={licenseTooltip(project)}
      className={`license license-${project.license.status}`}
    >
      {project.license.label}
    </Tooltip>
  );
}
```

For fork cards, have `ProjectGrid` pass `licensePlacement="relationship"` to
`ProjectCard` and `<ProjectLicense project={project} />` to
`ProjectRelationshipControl`. Replace the published relationship markup with:

```tsx
<div className="project-relationship-control">
  {license}
  <span className="project-relationship-separator" aria-hidden="true">
    ·
  </span>
  {canView ? (
    <button
      type="button"
      aria-label={`View relationship between ${relationship.parentName} and ${childProjectName}`}
      onClick={onViewRelationship}
    >
      Fork of {relationship.parentName}
    </button>
  ) : (
    <span className="project-relationship-origin">
      Fork of {relationship.parentName}
    </span>
  )}
</div>
```

Keep the existing unavailable-status suffix after the static fork origin.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-card.test.tsx
```

Expected: all tests in the file PASS.

### Task 2: Equal-height, left-weighted rendered layout

**Files:**
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/visual/catalog.visual.spec.ts`
- Modify: `src/styles/catalog.css`

**Interfaces:**
- `.project-relationship-control` overlays the existing utility-row space with `left: 18px`, `right: 48px`, and the same vertical alignment as `.card-utility`.
- `.project-relationship-control button` is the shrinkable element and truncates its label.
- Compact cards hide `.project-relationship-control` alongside `.card-bottom`.

- [ ] **Step 1: Write failing layout tests**

Replace the old padding assertions with CSS contracts for the inline overlay:

```ts
expect(css).not.toMatch(
  /\.project-card-shell\.has-relationship-control \.project-card\s*\{[^}]*padding-bottom:/s,
);
expect(css).toMatch(
  /\.project-relationship-control\s*\{[^}]*bottom:\s*10px[^}]*left:\s*18px[^}]*right:\s*48px[^}]*gap:\s*6px/s,
);
expect(css).toMatch(
  /\.project-relationship-control button\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/s,
);
expect(css).toMatch(
  /\.compact-cards \.project-relationship-control\s*\{[^}]*display:\s*none/s,
);
```

In `catalog.visual.spec.ts`, use a normal card and the controlled fork card,
then assert:

```ts
const normalHeight = (await normalCard.boundingBox())!.height;
const forkHeight = (await forkCard.boundingBox())!.height;
expect(forkHeight).toBe(normalHeight);

const licenseBox = (await forkCard.locator(".license").boundingBox())!;
const separatorBox = (await forkCard
  .locator(".project-relationship-separator")
  .boundingBox())!;
const relationshipBox = (await forkCard
  .locator(".project-relationship-control button")
  .boundingBox())!;
const kitBox = (await forkShell
  .locator(".project-kit-control-face")
  .boundingBox())!;
expect(licenseBox.x + licenseBox.width).toBeLessThan(separatorBox.x);
expect(separatorBox.x + separatorBox.width).toBeLessThan(relationshipBox.x);
expect(relationshipBox.x + relationshipBox.width).toBeLessThanOrEqual(kitBox.x);
```

Production mutation caught: restoring fork-only padding, spreading the
relationship away from the license, or allowing collision with the Kit
control makes these tests fail.

- [ ] **Step 2: Run focused layout tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:visual -- --grep "fork relationship"
```

Expected: the unit contract fails on old padding and old positioning; rendered
geometry fails because the fork card is taller than the ordinary card.

- [ ] **Step 3: Implement minimal CSS**

Remove both standard and compact fork-only padding rules. Change the
relationship control to the left-weighted utility overlay, constrain the button
with `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, and
`white-space: nowrap`, and hide the relationship control in compact mode where
the license utility row is also hidden.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-card.test.tsx tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:visual -- --grep "fork relationship"
```

Expected: focused unit and visual tests PASS with no overlap or overflow.

- [ ] **Step 5: Run proportional final verification**

Run:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Expected: every command exits 0 with no new warnings or failures.
