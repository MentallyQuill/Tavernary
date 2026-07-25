# Kits Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kits browse-first and tap-first on phones while preserving the
approved desktop workspace and fine-pointer drag behavior.

**Architecture:** Catalog page state continues to own mode, query, filters, and
the transient Kit draft. A shared modal-surface hook provides the accessibility
contract for mobile filters and the mobile workspace. Responsive capability
hooks distinguish the phone dialog threshold from touch/coarse-pointer editing.
Kit ordering remains immutable domain logic; the builder adds a short-lived
undo record without adding persistence.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Vitest, Testing Library,
Playwright, CSS media queries.

## Global Constraints

- Work only in the isolated `codex/kits` worktree.
- Follow red-green-refactor for every production behavior: add one focused
  failing test, run it and confirm the expected failure, implement the minimum
  behavior, rerun the focused test, then refactor.
- Do not add a backend, account, database, local persistence, Web Share, touch
  drag, drag-to-delete, or changes to Kit registry/publication policy.
- Preserve desktop entry behavior and fine-pointer drag, including drag ghost,
  placement preview, Escape cancellation, and edge autoscroll.
- Use 760 CSS pixels as the phone dialog boundary. Tablet and coarse-pointer
  layouts use tap ordering and the horizontal draft pill.
- All mobile controls introduced or changed by this plan must have a 44 by 44
  CSS-pixel hit area, or a full-width text-control height of at least 44 pixels.
- Keep production catalog output at 214 projects and zero Kits; fixture Kits
  are generated only by `npm.cmd run build:test-kits`.
- Commit each task after its focused tests are green.

---

## Task 1: Shared accessible modal surface and working Kit filters

**Files:**

- Create: `src/hooks/use-modal-surface.ts`
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/features/kits/components/kit-filter-panel.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Test: `tests/unit/modal-surface.test.tsx`
- Test: `tests/unit/kit-filter-panel.test.tsx`
- Test: `tests/kits-e2e/kits.spec.ts`

- [ ] **Step 1: Add a failing modal-surface component test**

Create a small harness in `tests/unit/modal-surface.test.tsx` that applies the
hook to a dialog and proves all of the following:

```tsx
expect(document.body).toHaveClass("sheet-open");
expect(screen.getByTestId("background")).toHaveAttribute("inert");
expect(screen.getByRole("heading", { name: "Filters" })).toHaveFocus();
await user.keyboard("{Escape}");
expect(onDismiss).toHaveBeenCalledOnce();
expect(screen.getByTestId("background")).not.toHaveAttribute("inert");
```

Add a second assertion that Tab and Shift+Tab wrap between the first and last
focusable controls.

- [ ] **Step 2: Run the modal test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/modal-surface.test.tsx
```

Expected failure: `use-modal-surface.ts` does not exist.

- [ ] **Step 3: Implement the shared hook**

Export:

```ts
export function useModalSurface({
  active,
  containerRef,
  initialFocusRef,
  onDismiss,
  inertSelectors,
}: {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  inertSelectors: readonly string[];
}): void;
```

When active, record the opener, add `sheet-open`, set `inert` on each matched
background element, focus `initialFocusRef`, trap Tab inside `containerRef`,
and dismiss on Escape. On cleanup, remove only inert attributes set by this
hook, remove `sheet-open`, and focus the recorded opener if it is still
connected and visible.

- [ ] **Step 4: Run the modal test and verify GREEN**

Run the focused test until all focus, Escape, inert, and cleanup assertions
pass.

- [ ] **Step 5: Add a failing Kit filter rendering test**

Render `KitFilterPanel` with `mobile` and assert:

```tsx
expect(screen.getByRole("dialog", { name: "Kit filters" })).toBeVisible();
expect(screen.getByRole("button", { name: "Close Kit filters" }))
  .toBeVisible();
expect(screen.getByRole("group", { name: "Frontend" })).toBeVisible();
```

Assert the mobile root uses the filter overlay/sheet structure and does not
carry the desktop-only `filter-panel` class.

- [ ] **Step 6: Run the Kit filter test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/kit-filter-panel.test.tsx
```

Expected failure: the current mobile panel is hidden by `.filter-panel`.

- [ ] **Step 7: Put both filter modes on the shared modal contract**

In both filter components, keep the existing desktop aside unchanged. For the
mobile branch, render:

```tsx
<div className="filter-overlay" role="presentation">
  <section
    ref={sheetRef}
    className="filter-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby={headingId}
  >
    ...
  </section>
</div>
```

Use `useModalSurface` with `.site-header`, `.mobile-category`, and
`.catalog-layout` as inert regions. Give Kit filters the same close button,
safe heading structure, scrolling body, and clear control as project filters.
Remove CatalogPage's independent `sheet-open` effect so modal lifecycle has one
owner. Ensure mode switches call the existing close helper before changing
mode, preventing stale project or Kit sheets.

- [ ] **Step 8: Add integrated filter and mode-local tests**

In `tests/kits-e2e/kits.spec.ts`, at 390 by 844:

1. enter Kits;
2. open Filters;
3. assert the Kit filter dialog is visible;
4. select a Kit-only option and verify the active count;
5. close and verify focus returns to Filters;
6. switch to Projects and assert no filter dialog is open;
7. reopen and assert project filters, not Kit filters, are shown.

- [ ] **Step 9: Run focused unit and Kits E2E tests**

Run:

```powershell
npm.cmd test -- tests/unit/modal-surface.test.tsx tests/unit/kit-filter-panel.test.tsx
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e -- --grep "mobile Kit filters"
```

- [ ] **Step 10: Commit Task 1**

Commit message: `fix(kits): make mobile filters accessible`

---

## Task 2: Browse-first phone entry, Create action, and draft pill

**Files:**

- Create: `src/hooks/use-responsive-capabilities.ts`
- Modify: `src/features/catalog/components/catalog-toolbar.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/kits/components/kit-workspace.tsx`
- Modify: `src/features/kits/use-kit-workspace.ts`
- Modify: `src/app/catalog.css`
- Modify: `src/app/responsive.css`
- Test: `tests/unit/kit-workspace.test.tsx`
- Test: `tests/e2e/kits-builder-mobile.spec.ts`
- Test: `tests/kits-e2e/kits.spec.ts`

- [ ] **Step 1: Add failing responsive workspace tests**

Mock `matchMedia` separately for phone, tablet/coarse pointer, and desktop.
Prove:

- phone + intro renders no dialog and no collapsed launcher;
- phone + explicitly selected Kit renders a dialog;
- phone + unknown selected Kit renders the not-found dialog;
- desktop + intro still renders the open complementary workspace;
- touch build + collapsed renders a button named
  `Open draft with 3 projects`;
- touch inspect + collapsed renders no launcher.

- [ ] **Step 2: Run the workspace tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/kit-workspace.test.tsx
```

Expected failures: phone intro still opens and collapsed workspaces always
render the vertical launcher.

- [ ] **Step 3: Implement responsive capability detection**

Export:

```ts
export function useResponsiveCapabilities(): {
  phone: boolean;
  touchLayout: boolean;
};
```

Subscribe to `(max-width: 760px)` for `phone` and
`(max-width: 1050px), (pointer: coarse)` for `touchLayout`. Clean up both media
listeners.

- [ ] **Step 4: Make mobile entry browse-first without changing URL entry**

`KitWorkspace` must return `null` for `phone && state.mode === "intro"`.
Inspection still opens whenever the state is explicitly `inspect`, including
valid and unknown shared IDs. In `CatalogPage`, selecting Kits must not
manufacture an inspect state; selecting a Kit continues to call `selectKit`.

Keep desktop intro open. Keep the active draft mounted or represented by its
pill across project browsing.

- [ ] **Step 5: Add the mobile Create Kit toolbar action**

Add to `CatalogToolbar`:

```ts
onCreateKit?: () => void;
```

Render **Create Kit** only in Kits mode, using a responsive class that displays
it at the phone threshold. Wire it to `workspace.startCreate` and ensure focus
enters the builder heading after the dialog opens.

- [ ] **Step 6: Implement the touch draft pill**

For `touchLayout && state.mode === "build" && state.collapsed`, render a fixed
horizontal button:

```tsx
<button
  className="kit-draft-pill"
  aria-label={`Open draft with ${state.draft.projectIds.length} projects`}
>
  Draft <span aria-hidden="true">·</span>{" "}
  {state.draft.projectIds.length} projects
</button>
```

It must call the expand callback, become the close button's focus-return
target, be at least 44 pixels tall, use safe-area bottom spacing, and never use
vertical writing. Keep the existing desktop collapsed edge control.

- [ ] **Step 7: Add failing integrated browse and draft tests**

At 390 by 844 prove:

- switching to Kits reveals cards with no dialog;
- Create Kit opens the builder;
- closing leaves a zero-project draft pill;
- adding three distinct projects updates the pill 0, 1, 2, 3;
- each added card changes from Add to Kit to Added;
- adding does not force the builder open;
- activating the pill reopens the same draft;
- selecting and closing a Kit returns focus to its card action.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/kit-workspace.test.tsx
npm.cmd run test:e2e -- --grep "mobile Kits builder"
npm.cmd run test:kits-e2e -- --grep "browse-first|draft pill"
```

- [ ] **Step 9: Commit Task 2**

Commit message: `feat(kits): add browse-first mobile entry`

---

## Task 3: Tap-first ordering, delayed validation, and six-second Undo

**Files:**

- Modify: `src/features/kits/project-stack-order.ts`
- Modify: `src/features/kits/components/kit-builder.tsx`
- Modify: `src/features/kits/components/kit-builder-row.tsx`
- Modify: `src/app/catalog.css`
- Modify: `src/app/responsive.css`
- Test: `tests/unit/project-stack-order.test.ts`
- Test: `tests/unit/kit-builder.test.tsx`

- [ ] **Step 1: Add a failing immutable insertion test**

Add coverage for:

```ts
expect(insertProject(["a", "c"], "b", 1)).toEqual(["a", "b", "c"]);
expect(insertProject(["a"], "a", 0)).toEqual(["a"]);
expect(insertProject(["a"], "b", 99)).toEqual(["a", "b"]);
```

- [ ] **Step 2: Run the ordering test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-stack-order.test.ts
```

Expected failure: `insertProject` is not exported.

- [ ] **Step 3: Implement immutable clamped insertion**

Export `insertProject(projectIds, projectId, index)`. Return the original set
unchanged for duplicates; otherwise clamp `index` from zero through length and
return a new array.

- [ ] **Step 4: Add failing builder accessibility and validation tests**

Prove:

- Title and Description keep stable names while counters change;
- counters are connected through `aria-describedby`;
- untouched empty fields show no validation errors;
- blurring Title shows its field error;
- first invalid submit shows all applicable field/composition errors;
- a valid submit calls `onSubmit`.

The submit button stays enabled so the first submit attempt can expose errors.

- [ ] **Step 5: Add failing touch-order and Undo tests**

Mock a touch layout and prove there is no `Drag ...` button while Move up, Move
down, and Remove remain. With fake timers:

1. remove the middle project;
2. assert `Removed <name>. Undo` is announced;
3. activate Undo and verify the original index;
4. remove again and advance 6000 milliseconds;
5. assert Undo is gone;
6. remove two projects in succession and verify only the latest removal can be
   restored.

- [ ] **Step 6: Run builder tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/kit-builder.test.tsx
```

Expected failures: errors display immediately, submit is disabled, touch still
renders drag handles, and Undo is absent.

- [ ] **Step 7: Implement stable fields and delayed validation**

Use explicit IDs:

```ts
const titleId = "kit-title";
const titleCountId = "kit-title-count";
const titleErrorId = "kit-title-error";
```

Repeat for Description. Track `touched.title`, `touched.description`, and
`submitAttempted`. Derive visible field errors from touched/submit state and
composition errors from submit state. Keep counters separate from `<label>`
text and connect them with `aria-describedby`. On invalid submit set the submit
flag and focus the first invalid field or validation summary.

- [ ] **Step 8: Implement touch controls without removing desktop drag**

Pass `touchLayout` to `KitBuilderRow`. Render the drag handle only when false.
Keep Move up/down/Remove in both layouts. After a move, retain focus on the same
named button in its moved row. CSS hides drag ghost and placement treatment on
touch/coarse layouts while leaving desktop CSS and `useProjectStackDrag`
unchanged.

- [ ] **Step 9: Implement removal Undo**

Store one record:

```ts
type RemovedProject = {
  projectId: string;
  projectName: string;
  index: number;
};
```

Removal updates the draft immediately, replaces any previous record, and starts
a six-second timer. Render an assertive live region with a 44-pixel Undo
button. Undo calls `insertProject` at the recorded index and clears the record.
Clear the timer on replacement and unmount.

- [ ] **Step 10: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-stack-order.test.ts tests/unit/kit-builder.test.tsx
```

- [ ] **Step 11: Commit Task 3**

Commit message: `feat(kits): add tap-first mobile editing`

---

## Task 4: Sticky safe-area workspace and 44-pixel touch contract

**Files:**

- Modify: `src/features/kits/components/kit-workspace.tsx`
- Modify: `src/features/kits/components/kit-project-stack.tsx`
- Modify: `src/features/kits/components/kit-card.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/app/catalog.css`
- Modify: `src/app/responsive.css`
- Test: `tests/e2e/kits-builder-mobile.spec.ts`
- Test: `tests/kits-e2e/kits.spec.ts`

- [ ] **Step 1: Add failing mobile geometry tests**

At 320, 390, and 430 CSS-pixel widths, use a helper that checks each relevant
button/link/input/textarea bounding box. Prove:

- close, Create, filter, Kit card Copy/Report, inspection actions, project
  disclosures, Add/Added, Move up/down/Remove, Undo, draft pill, and Submit
  meet the 44-pixel contract;
- `document.documentElement.scrollWidth <= window.innerWidth`;
- dialog `scrollWidth <= clientWidth`.

- [ ] **Step 2: Add a failing 50-project sticky-region test**

Open a fixture Kit with 50 projects, scroll the builder content to the end, and
assert the workspace header and builder footer both intersect the viewport and
remain actionable. Assert the last row is not obscured by the footer.

- [ ] **Step 3: Run integrated tests and verify RED**

Run:

```powershell
npm.cmd run test:e2e -- --grep "touch targets"
npm.cmd run test:kits-e2e -- --grep "touch targets|50-project"
```

Expected failures: current controls are undersized, safe-area padding is
missing, and the builder header/footer are not sticky.

- [ ] **Step 4: Restructure the workspace into fixed regions**

Keep the root at `100dvh`. Use:

- sticky `.kit-workspace-header`;
- a flex/min-height-zero independently scrolling workspace body;
- sticky `.kit-builder-footer` containing project count, validation summary,
  Undo status, and Submit;
- `env(safe-area-inset-*)` padding on the root, header, footer, filter sheet,
  and draft pill.

Make background catalog regions inert through `useModalSurface` while the phone
workspace is open. Preserve dialog name, focus trap, Escape, and focus return.

- [ ] **Step 5: Apply the mobile touch and wrapping rules**

At the phone threshold:

- make every scoped control at least 44 pixels in the required dimension;
- make form controls at least 44 pixels tall;
- allow inspection actions to wrap into one or two columns;
- make project disclosures at least 44 pixels tall;
- prevent min-content overflow with `min-width: 0`, wrapping, and grid tracks
  using `minmax(0, 1fr)`;
- add catalog bottom padding while the draft pill exists;
- preserve visible `:focus-visible`;
- disable nonessential transition/animation under
  `prefers-reduced-motion: reduce`.

- [ ] **Step 6: Run geometry, sticky, and regression tests**

Run:

```powershell
npm.cmd run test:e2e -- --grep "mobile Kits builder|touch targets"
npm.cmd run test:kits-e2e -- --grep "touch targets|50-project"
npm.cmd test -- tests/unit/kit-workspace.test.tsx tests/unit/kit-builder.test.tsx
```

- [ ] **Step 7: Commit Task 4**

Commit message: `style(kits): harden mobile workspace layout`

---

## Task 5: Integrated mobile workflow and visual baselines

**Files:**

- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts`
- Replace generated images:
  `tests/kits-e2e/kits.visual.spec.ts-snapshots/*.png`
- Modify only if behavior legitimately changes:
  `tests/e2e/kits-builder-mobile.spec.ts`
- Modify only if visual output legitimately changes:
  `tests/visual/*.spec.ts-snapshots/*.png`

- [ ] **Step 1: Add the complete failing mobile workflow**

At 390 by 844, test in one fresh session:

1. Kits opens to cards with no dialog;
2. Kit filters open, apply, clear, close, and return focus;
3. Create opens and closes to the zero-project draft pill;
4. three projects are added without opening the builder;
5. the pill reports three projects and reopens the builder;
6. Move down and Move up reorder by tap;
7. Remove followed by Undo restores the exact prior order;
8. closing preserves the draft;
9. selecting a Kit opens inspection;
10. closing inspection restores focus to the selected card.

- [ ] **Step 2: Run the workflow and verify RED or GREEN for the right reason**

Run:

```powershell
npm.cmd run test:kits-e2e -- --grep "complete mobile Kits workflow"
```

If green immediately, inspect assertions to ensure every step causes and
observes a state transition rather than only checking element presence.

- [ ] **Step 3: Add six mobile visual cases**

Capture at 390 by 844:

- `kits-mobile-browse`;
- `kits-mobile-filters`;
- `kits-mobile-draft-pill`;
- `kits-mobile-builder-three`;
- `kits-mobile-builder-long-scrolled`;
- `kits-mobile-inspect`.

Mask only genuinely nondeterministic external data. Do not mask the controls or
layout under review.

- [ ] **Step 4: Generate fixture output and update baselines**

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-visual -- --update-snapshots
npm.cmd run test:kits-visual
```

- [ ] **Step 5: Inspect every changed mobile image**

Open each changed PNG and verify no clipped controls, vertical launcher text,
hidden content, undersized-looking controls, stale overlay, unexpected
horizontal overflow, or footer obstruction. If any issue is visible, add a
failing assertion where practical, fix it, regenerate, and inspect again.

- [ ] **Step 6: Commit Task 5**

Commit message: `test(kits): prove mobile interaction workflows`

---

## Task 6: Complete verification and production restoration

**Files:**

- Verify: all changed source, test, fixture, documentation, and snapshot files
- Verify: `src/registry/kits/`

- [ ] **Step 1: Run formatting and focused static checks**

Run:

```powershell
npm.cmd run format
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- tests/unit/modal-surface.test.tsx tests/unit/kit-filter-panel.test.tsx tests/unit/kit-workspace.test.tsx tests/unit/project-stack-order.test.ts tests/unit/kit-builder.test.tsx
```

- [ ] **Step 2: Run the complete production gate**

Run:

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
```

Confirm production build reports 214 projects and zero Kits.

- [ ] **Step 3: Run the complete fixture gate**

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
```

- [ ] **Step 4: Restore and prove production registry state**

Run the production catalog build after fixture tests:

```powershell
npm.cmd run catalog:build
git status --short
Get-ChildItem src/registry/kits -Force
```

Confirm the registry contains only `.gitkeep`, generated production data again
contains zero Kits, and no fixture source or generated fixture output remains.

- [ ] **Step 5: Inspect the complete diff**

Run:

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Confirm the diff matches the approved mobile spec, has no placeholders, no
unrelated edits, and no uncommitted changes.

- [ ] **Step 6: Request code review and apply only verified findings**

Use `superpowers:requesting-code-review`. If review identifies an actionable
defect, reproduce it with a failing test, make the minimum fix, rerun the
affected focused tests, then repeat the complete applicable gate.

- [ ] **Step 7: Finish the branch**

Use `superpowers:verification-before-completion`, then
`superpowers:finishing-a-development-branch`. Report the exact tests and counts
from fresh output and offer the approved branch-integration choices.
