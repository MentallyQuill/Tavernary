# Kits Motion and Direct-Manipulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the interim Kits move/remove controls with the approved
grab-handle interaction, exactly-one pinned Frontend, restrained tactile
motion, responsive removal behavior, and non-overlapping desktop workspace.

**Architecture:** Pure composition and drag-geometry helpers own domain and
placement decisions. React components expose explicit interaction states while
small pointer hooks own capture, thresholds, autoscroll, and cleanup. CSS
performs the approved interpolation; no animation library or timer becomes a
source of domain truth.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, CSS transitions, Pointer
Events, Vitest, Testing Library, Playwright.

## Global Constraints

- Work only in the isolated `F:\git\Tavernary\.worktrees\kits` worktree on
  `codex/kits`.
- Execute inline with `superpowers:executing-plans`; the user explicitly chose
  inline implementation.
- Follow strict red-green-refactor for every production behavior: add one
  focused failing test, run it and confirm the expected failure, implement the
  minimum behavior, rerun the focused test, then refactor.
- Preserve the already-proven mode-local mobile filter fix currently present
  in the worktree.
- Replace the uncommitted interim move-focus code; do not commit Move up, Move
  down, Remove text, or Undo behavior.
- A valid Kit contains exactly one Frontend and two to 49 non-Frontend
  projects, for three to 50 unique projects total.
- Normalize the Frontend to project index zero. It is pinned and cannot be
  reordered.
- Desktop uses handles for reorder and drag-off removal plus a corner `×`.
- Tablet and mobile use handles for non-Frontend reorder and the corner `×`
  for removal. The pinned Frontend has no touch handle.
- Removal is immediate and final. Do not add Undo, confirmation, or a remove
  bar.
- Use 4 CSS pixels as the pointer movement threshold.
- Use 80 ms press, 120 ms state, 150 ms card, and 220 ms panel timings with
  `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Mobile sheets move from the bottom with no opacity fade.
- Desktop workspace remains in flow and displaces catalog cards; it never
  overlays them.
- Add no animation dependency, backend, account, database, local persistence,
  or Web Share integration.
- Keep production catalog output at 214 projects and zero Kits. Fixture Kits
  are generated only by `npm.cmd run build:test-kits`.
- Commit each task after its focused tests are green.

---

### Task 1: Exactly-One Frontend Domain Contract

**Files:**

- Create: `src/features/kits/kit-project-layout.ts`
- Modify: `src/features/kits/kit-domain.mjs`
- Modify: `src/features/kits/kit-domain.d.mts`
- Modify: `scripts/kits/validation.mjs`
- Test: `tests/unit/kit-project-layout.test.ts`
- Test: `tests/unit/kit-domain.test.ts`
- Test: `tests/unit/validate-kits.test.ts`
- Test: `tests/unit/validate-kit-submission.test.ts`

**Interfaces:**

- Consumes: `CatalogProject`, `KitDraft.projectIds`.
- Produces:

```ts
export type KitProjectLayout = {
  frontendId: string | null;
  stackProjectIds: string[];
};

export function splitKitProjectIds(
  projectIds: readonly string[],
  projects: readonly Pick<CatalogProject, "id" | "kind">[],
): KitProjectLayout;

export function normalizeKitProjectIds(
  projectIds: readonly string[],
  projects: readonly Pick<CatalogProject, "id" | "kind">[],
): string[];

export function replaceKitFrontend(
  projectIds: readonly string[],
  frontendId: string,
  projects: readonly Pick<CatalogProject, "id" | "kind">[],
): string[];
```

- `splitKitProjectIds` selects the first known Frontend and excludes every
  known Frontend from `stackProjectIds`.
- `normalizeKitProjectIds` returns `[frontendId, ...stackProjectIds]` when a
  Frontend exists and only `stackProjectIds` otherwise.
- `replaceKitFrontend` removes all known Frontends, prepends `frontendId`, and
  preserves non-Frontend order.

- [ ] **Step 1: Write failing project-layout tests**

Add:

```ts
test("splits, normalizes, and replaces the pinned Frontend", () => {
  expect(
    splitKitProjectIds(["memory", "frontend-a", "preset"], projects),
  ).toEqual({
    frontendId: "frontend-a",
    stackProjectIds: ["memory", "preset"],
  });
  expect(
    normalizeKitProjectIds(["memory", "frontend-a", "preset"], projects),
  ).toEqual(["frontend-a", "memory", "preset"]);
  expect(
    replaceKitFrontend(
      ["frontend-a", "memory", "frontend-b", "preset"],
      "frontend-b",
      projects,
    ),
  ).toEqual(["frontend-b", "memory", "preset"]);
});
```

- [ ] **Step 2: Run the layout test and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-project-layout.test.ts
```

Expected: FAIL because `kit-project-layout.ts` does not exist.

- [ ] **Step 3: Implement the pure layout helpers**

Build one `Map<string, "frontend" | "extension" | "preset">`, partition in one
pass, and never mutate the input array. `replaceKitFrontend` must throw a
`TypeError` when `frontendId` is not a known Frontend so callers cannot silently
corrupt the draft.

- [ ] **Step 4: Run the layout test and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-project-layout.test.ts
```

- [ ] **Step 5: Write failing exact-composition tests**

Extend `tests/unit/kit-domain.test.ts`:

```ts
test("requires exactly one first-position Frontend", () => {
  const two = validateKitDraft(
    { ...validDraft, projectIds: ["frontend", "frontend-b", "memory"] },
    projectsWithTwoFrontends,
  );
  expect(two.errors).toContain("A Kit requires exactly one Frontend.");

  const misplaced = validateKitDraft(
    { ...validDraft, projectIds: ["memory", "frontend", "preset"] },
    projects,
  );
  expect(misplaced.errors).toContain(
    "The Kit Frontend must be the first project.",
  );
});
```

Add matching submission assertions and a registry test proving a canonical Kit
with two Frontends or a non-leading Frontend is rejected.

- [ ] **Step 6: Run the domain and registry tests and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-domain.test.ts tests/unit/validate-kits.test.ts tests/unit/validate-kit-submission.test.ts
```

Expected: the current `frontendCount < 1` contract accepts two Frontends and
does not enforce index zero.

- [ ] **Step 7: Enforce the new validation contract**

In `validateKitDraft`, emit these independent composition errors:

```js
if (frontendCount !== 1) {
  errors.push("A Kit requires exactly one Frontend.");
}
if (frontendCount === 1 && resolved[0]?.kind !== "frontend") {
  errors.push("The Kit Frontend must be the first project.");
}
if (nonFrontendCount < 2) {
  errors.push("A Kit requires at least two non-Frontend projects.");
}
```

In registry validation, count known Frontends and verify the first resolved
project is the sole Frontend. Retained flagged non-Frontend rows remain valid
for canonical published records.

- [ ] **Step 8: Run all Task 1 tests and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-project-layout.test.ts tests/unit/kit-domain.test.ts tests/unit/validate-kits.test.ts tests/unit/validate-kit-submission.test.ts
```

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- src/features/kits/kit-project-layout.ts src/features/kits/kit-domain.mjs src/features/kits/kit-domain.d.mts scripts/kits/validation.mjs tests/unit/kit-project-layout.test.ts tests/unit/kit-domain.test.ts tests/unit/validate-kits.test.ts tests/unit/validate-kit-submission.test.ts
git commit -m "feat(kits): enforce one frontend"
```

---

### Task 2: Pinned Frontend Slot and Explicit Card Controls

**Files:**

- Create: `src/features/kits/components/kit-frontend-slot.tsx`
- Modify: `src/features/kits/components/kit-builder.tsx`
- Modify: `src/features/kits/components/kit-builder-row.tsx`
- Modify: `src/features/catalog/components/project-grid.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/kits/use-kit-workspace.ts`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Test: `tests/unit/kit-builder.test.tsx`
- Test: `tests/unit/project-card.test.tsx`

**Interfaces:**

- Consumes: Task 1 layout helpers.
- Produces:

```ts
type KitFrontendSlotProps = {
  project: CatalogProject | null;
  touchLayout: boolean;
  onRemove: () => void;
  onDragStart: PointerEventHandler<HTMLButtonElement>;
};
```

```ts
type ProjectGridProps = {
  draftProjectIds?: string[];
  draftFrontendId?: string | null;
  onAddToKit?: (projectId: string) => void;
};
```

- [ ] **Step 1: Replace obsolete builder tests with failing approved-contract tests**

Delete assertions for Move up, Move down, Remove text, and six-second Undo.
Add:

```tsx
expect(
  screen.getByRole("button", { name: "Drag memory to reorder or remove" }),
).toBeVisible();
expect(
  screen.getByRole("button", { name: "Remove memory" }),
).toHaveTextContent("×");
expect(
  screen.queryByRole("button", { name: /Move memory/ }),
).not.toBeInTheDocument();
expect(screen.queryByText("Undo")).not.toBeInTheDocument();
```

Assert the Frontend renders in a separate region named `Frontend`, before the
ordered list, and not as a normal `[data-project-id]` stack row.

For touch:

```tsx
expect(
  screen.queryByRole("button", { name: "Drag to remove frontend" }),
).not.toBeInTheDocument();
expect(
  screen.getByRole("button", { name: "Drag memory to reorder" }),
).toBeVisible();
```

- [ ] **Step 2: Run the builder tests and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder.test.tsx
```

Expected: current rows still expose text actions and hide all touch handles.

- [ ] **Step 3: Render the pinned Frontend and reorderable stack**

Use `splitKitProjectIds` in `KitBuilder`. Render:

```tsx
<section className="kit-frontend-foundation" aria-labelledby={frontendHeadingId}>
  <h3 id={frontendHeadingId}>Frontend</h3>
  <KitFrontendSlot ... />
</section>
<ol className="kit-builder-stack" aria-label="Ordered Kit projects">
  {stackProjectIds.map(...)}
</ol>
```

An empty slot reads `Choose one Frontend`. Remove all Undo state, timers,
`insertProject` usage, `moveAndRestoreFocus`, visible order controls, and their
CSS.

Keep a small `×` glyph inside a 44-by-44 button. After removal, focus the next
row's removal button, then the previous row's removal button, then the empty
Frontend slot.

- [ ] **Step 4: Add failing replacement-button tests**

Render `ProjectGrid` with `draftFrontendId="frontend"` and two Frontends.
Assert:

```tsx
expect(
  screen.getByRole("button", { name: "frontend added to Kit" }),
).toBeDisabled();
expect(
  screen.getByRole("button", { name: "Use frontend-b instead" }),
).toBeEnabled();
```

Activate **Use instead** and expect one callback with `frontend-b`.

- [ ] **Step 5: Run the project-card tests and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/project-card.test.tsx tests/unit/kit-builder.test.tsx
```

- [ ] **Step 6: Wire add versus replace**

In `CatalogPage`, derive `draftFrontendId` from the complete catalog and call:

```ts
project.kind === "frontend"
  ? replaceKitFrontend(draft.projectIds, project.id, catalog.projects)
  : addProject(draft.projectIds, project.id);
```

Normalize duplicate/edit source order when creating a draft. Project cards use
**Added**, **Use instead**, or **Add to Kit** according to kind and draft state.

- [ ] **Step 7: Run Task 2 tests and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder.test.tsx tests/unit/project-card.test.tsx tests/unit/kit-workspace.test.tsx
```

- [ ] **Step 8: Commit Task 2**

```powershell
git add -- src/features/kits/components/kit-frontend-slot.tsx src/features/kits/components/kit-builder.tsx src/features/kits/components/kit-builder-row.tsx src/features/catalog/components/project-grid.tsx src/features/catalog/components/catalog-page.tsx src/features/kits/use-kit-workspace.ts src/styles/catalog.css src/styles/responsive.css tests/unit/kit-builder.test.tsx tests/unit/project-card.test.tsx tests/unit/kit-workspace.test.tsx
git commit -m "feat(kits): pin kit frontend"
```

---

### Task 3: Stack Drag Geometry and Pointer Lifecycle

**Files:**

- Create: `src/features/kits/project-stack-drag-geometry.ts`
- Modify: `src/features/kits/use-project-stack-drag.ts`
- Modify: `src/features/kits/components/kit-builder.tsx`
- Modify: `src/features/kits/components/kit-builder-row.tsx`
- Modify: `src/features/kits/components/kit-frontend-slot.tsx`
- Test: `tests/unit/project-stack-drag-geometry.test.ts`
- Test: `tests/unit/kit-builder.test.tsx`

**Interfaces:**

- Produces:

```ts
export type Point = { x: number; y: number };
export type DragRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export function exceedsDragThreshold(
  origin: Point,
  current: Point,
  threshold?: number,
): boolean;

export function stackTargetIndex(
  pointerY: number,
  rows: readonly { index: number; rect: DragRect }[],
  sourceIndex: number,
): number;

export function isOutsideEditor(point: Point, editor: DragRect): boolean;
```

- `useProjectStackDrag` produces:

```ts
type ProjectStackDragState = {
  phase: "pressed" | "reorder" | "remove";
  projectId: string;
  pointerId: number;
  point: Point;
  sourceRect: DragRect | null;
  sourceIndex: number;
  targetIndex: number;
};
```

- [ ] **Step 1: Write failing pure geometry tests**

Cover:

```ts
expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
expect(isOutsideEditor({ x: 101, y: 50 }, editorRect)).toBe(true);
expect(isOutsideEditor({ x: 100, y: 50 }, editorRect)).toBe(false);
```

Use three row rectangles and assert midpoint crossing produces the expected
target index above and below the source.

- [ ] **Step 2: Run geometry tests and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/project-stack-drag-geometry.test.ts
```

- [ ] **Step 3: Implement pure geometry**

Use squared Euclidean distance for the 4-pixel activation threshold. Clamp
target indices to the non-Frontend stack. Treat the editor boundary as
inclusive; removal arms only after the handle point crosses outside it.

- [ ] **Step 4: Run geometry tests and verify GREEN**

- [ ] **Step 5: Write failing pointer lifecycle tests**

Prove:

1. pointer-down alone has phase `pressed`, no capture, and no ghost;
2. 3 pixels of movement changes nothing;
3. 4 pixels captures the pointer and enters `reorder`;
4. crossing row midpoints changes the physical-gap target;
5. desktop movement outside `editorRef` enters `remove`;
6. returning inside returns to `reorder`;
7. touch never enters `remove`;
8. Escape, pointer-cancel, and lost capture make no mutation;
9. pointer-up commits exactly once;
10. the pinned Frontend can enter desktop `remove` but never `reorder`.

- [ ] **Step 6: Run builder tests and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder.test.tsx
```

- [ ] **Step 7: Refactor the drag hook**

The hook receives:

```ts
useProjectStackDrag({
  projectIds,
  editorRef,
  stackRef,
  touchLayout,
  onReorder,
  onRemove,
});
```

`begin(projectId, event, { reorderable })` records the origin. At activation it
measures the editor, source, and all stack rows, captures the pointer, starts
edge autoscroll, and adds window listeners.

Move processing runs through one pending `requestAnimationFrame`. Directly
update the ghost point and derive row offsets from source/target indices.
Recompute row rectangles after autoscroll.

On finish:

- `reorder` calls `onReorder` with one immutable array;
- desktop `remove` calls `onRemove(projectId)`;
- cancellation calls neither;
- cleanup releases capture, cancels animation/autoscroll, removes listeners,
  and clears state exactly once.

- [ ] **Step 8: Render a source-sized ghost and physical gap**

Render the ghost through `createPortal(..., document.body)`. Set measured width,
height, and pointer offset with CSS custom properties. Hide the source card
content while preserving its card-sized gap. Apply transforms to displaced
rows; do not render an insertion line.

The remove phase adds `data-drag-intent="remove"` and visible
**Release to remove** copy.

Wire Alt+Arrow Up and Alt+Arrow Down on non-Frontend handles to immutable
`stackProjectIds` reorder operations. After React commits, find the moved row
by `data-project-id` and return focus to its handle. The pinned Frontend handle
does not register these keys.

- [ ] **Step 9: Run Task 3 tests and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/project-stack-drag-geometry.test.ts tests/unit/kit-builder.test.tsx
```

- [ ] **Step 10: Commit Task 3**

```powershell
git add -- src/features/kits/project-stack-drag-geometry.ts src/features/kits/use-project-stack-drag.ts src/features/kits/components/kit-builder.tsx src/features/kits/components/kit-builder-row.tsx src/features/kits/components/kit-frontend-slot.tsx tests/unit/project-stack-drag-geometry.test.ts tests/unit/kit-builder.test.tsx
git commit -m "feat(kits): add direct stack gestures"
```

---

### Task 4: Desktop Catalog Drag-to-Add and Frontend Replacement

**Files:**

- Create: `src/features/kits/use-catalog-project-drag.ts`
- Modify: `src/features/catalog/components/project-grid.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/kits/components/kit-workspace.tsx`
- Modify: `src/features/kits/components/kit-builder.tsx`
- Modify: `src/features/kits/components/kit-frontend-slot.tsx`
- Test: `tests/unit/catalog-project-drag.test.tsx`
- Test: `tests/unit/project-card.test.tsx`
- Test: `tests/kits-e2e/kits.spec.ts`

**Interfaces:**

- Produces:

```ts
type CatalogDropTarget = "frontend" | "stack" | null;

type CatalogProjectDragState = {
  projectId: string;
  point: Point;
  target: CatalogDropTarget;
  valid: boolean;
  actionLabel: string;
};
```

`useCatalogProjectDrag` returns `{ dragState, begin }`. `begin` is exposed only
on fine-pointer desktop layouts.

- [ ] **Step 1: Write a failing catalog-drag harness test**

Prove:

- 4-pixel activation and pointer capture;
- a Frontend over `[data-kit-drop-target="frontend"]` is valid;
- a Frontend over the stack is invalid;
- a non-Frontend over the stack is valid;
- a non-Frontend over the Frontend slot is invalid;
- Escape and pointer-cancel do not add;
- pointer-up calls `onDrop(projectId, target)` once.

- [ ] **Step 2: Run the catalog-drag test and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/catalog-project-drag.test.tsx
```

- [ ] **Step 3: Implement the desktop catalog drag hook**

Use pointer capture, the shared 4-pixel threshold, one animation-frame move
loop, and deterministic cleanup. Resolve targets from:

```html
data-kit-drop-target="frontend"
data-kit-drop-target="stack"
```

The ghost label is:

- **Release to add** for an empty compatible target;
- **Release to replace _current frontend_** for a populated Frontend slot;
- **Not a valid Kit target** otherwise.

- [ ] **Step 4: Expose source handles and target state**

While a draft is active on fine-pointer desktop, every project-card shell gains
a compact handle labeled **Drag _project_ into Kit**. It is a sibling of the
project link and Add/Use button so link activation remains intact.

Pass `dragState` through `KitWorkspace` to `KitBuilder`. The Frontend slot and
stack apply explicit `data-drop-state="valid|invalid|idle"` attributes.

On drop:

```ts
target === "frontend"
  ? replaceKitFrontend(...)
  : addProject(...);
```

- [ ] **Step 5: Write the failing integrated replacement gesture**

At desktop width:

1. create a draft;
2. drag Frontend A onto the empty slot;
3. assert it is pinned and the stack is unchanged;
4. drag Frontend B onto the slot;
5. assert **Release to replace Frontend A** appears;
6. release and assert only Frontend B remains;
7. drag an extension to the stack and assert it appends.

- [ ] **Step 6: Run focused unit and E2E tests**

Run:

```powershell
npx.cmd vitest run tests/unit/catalog-project-drag.test.tsx tests/unit/project-card.test.tsx
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e -- --grep "desktop catalog drag"
```

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- src/features/kits/use-catalog-project-drag.ts src/features/catalog/components/project-grid.tsx src/features/catalog/components/catalog-page.tsx src/features/kits/components/kit-workspace.tsx src/features/kits/components/kit-builder.tsx src/features/kits/components/kit-frontend-slot.tsx tests/unit/catalog-project-drag.test.tsx tests/unit/project-card.test.tsx tests/kits-e2e/kits.spec.ts
git commit -m "feat(kits): drag projects into drafts"
```

---

### Task 5: Tactile Card and Reorder Motion

**Files:**

- Modify: `src/features/catalog/components/project-grid.tsx`
- Modify: `src/features/kits/components/kit-card.tsx`
- Modify: `src/features/kits/components/kit-builder-row.tsx`
- Modify: `src/features/kits/components/kit-frontend-slot.tsx`
- Modify: `src/features/kits/components/kit-builder.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Test: `tests/unit/visual-alignment-contract.test.ts`
- Test: `tests/e2e/kits-builder-mobile.spec.ts`
- Test: `tests/kits-e2e/kits.spec.ts`

**Interfaces:**

- CSS custom properties:

```css
--kit-motion-press: 80ms;
--kit-motion-state: 120ms;
--kit-motion-card: 150ms;
--kit-motion-panel: 220ms;
--kit-motion-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
```

- Explicit states:

```html
data-drag-phase="idle|pressed|reorder|remove"
data-drop-state="idle|valid|invalid"
data-removing="true|false"
```

- [ ] **Step 1: Add failing static motion-contract assertions**

Assert:

- the four exact timings and easing exist;
- Kit and project tile lift is `translateY(-2px)`;
- hover rules are inside `(hover: hover) and (pointer: fine)`;
- builder-card lift is driven by handle hover/focus, not row hover;
- `.kit-drag-ghost` has `transition: none`;
- no `spring`, `bounce`, `rotate`, `filter: blur`, or animation library import
  appears in Kits source;
- system `prefers-reduced-motion` removes spatial transitions without adding a
  product setting.

- [ ] **Step 2: Run the static contract test and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts
```

- [ ] **Step 3: Implement the motion vocabulary**

Apply:

- 2-pixel hover/focus lift to published Kit and project tiles;
- 98-percent/80-millisecond press response to actionable tiles and buttons;
- 150-millisecond Add-to-Kit/Added state change;
- one 2–3 percent draft-count acknowledgement;
- border/background-only response for inspection rows;
- quiet always-present `×` with danger hover/focus;
- handle-driven builder-card lift;
- 150-millisecond row displacement and gap closure;
- 120-millisecond desktop remove-intent treatment;
- no filter/sort grid animation.

The source-sized drag ghost has direct `translate3d` updates and no transition.

- [ ] **Step 4: Add failing touch-target and responsive-gesture assertions**

At 320, 390, and 430 CSS pixels prove:

- every `×` is at least 44 by 44;
- the Frontend has no handle;
- non-Frontend handles are at least 44 by 44;
- touch reorder works;
- dragging beyond the touch workspace never removes;
- tapping `×` removes immediately;
- there is no Undo or remove bar.

- [ ] **Step 5: Run focused browser tests and verify RED**

Run:

```powershell
npm.cmd run test:e2e -- --grep "mobile Kits builder|touch targets"
npm.cmd run test:kits-e2e -- --grep "touch reorder|corner removal"
```

- [ ] **Step 6: Finish responsive styling and focus behavior**

Use one-column compact rows on touch without hiding non-Frontend handles.
Preserve safe-area padding and horizontal overflow constraints. Keyboard
Alt+Arrow movement and `×` removal retain focus according to the spec.

- [ ] **Step 7: Run Task 5 tests and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts tests/unit/kit-builder.test.tsx
npm.cmd run test:e2e -- --grep "mobile Kits builder|touch targets"
npm.cmd run test:kits-e2e -- --grep "touch reorder|corner removal"
```

- [ ] **Step 8: Commit Task 5**

```powershell
git add -- src/features/catalog/components/project-grid.tsx src/features/kits/components/kit-card.tsx src/features/kits/components/kit-builder-row.tsx src/features/kits/components/kit-frontend-slot.tsx src/features/kits/components/kit-builder.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/visual-alignment-contract.test.ts tests/e2e/kits-builder-mobile.spec.ts tests/kits-e2e/kits.spec.ts
git commit -m "style(kits): add tactile motion"
```

---

### Task 6: Animated Surface Presence and In-Flow Desktop Workspace

**Files:**

- Create: `src/hooks/use-transition-presence.ts`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/features/kits/components/kit-filter-panel.tsx`
- Modify: `src/features/kits/components/kit-workspace.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Test: `tests/unit/transition-presence.test.tsx`
- Test: `tests/unit/kit-workspace.test.tsx`
- Test: `tests/kits-e2e/kits.spec.ts`

**Interfaces:**

- Produces:

```ts
export function useTransitionPresence(
  visible: boolean,
  durationMs: number,
): {
  present: boolean;
  phase: "entering" | "entered" | "exiting";
};
```

- [ ] **Step 1: Write failing presence lifecycle tests**

With fake timers prove:

- visible mounts in `entering`;
- the next animation frame changes to `entered`;
- false changes to `exiting` without unmounting;
- unmount occurs after 220 milliseconds;
- reopening during exit reverses to `entering`;
- system reduced-motion resolves enter/exit without spatial delay.

- [ ] **Step 2: Run presence tests and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/transition-presence.test.tsx
```

- [ ] **Step 3: Implement interruptible presence**

Track one timeout and one animation frame. Clear both on reversal and unmount.
Expose state only; do not own domain visibility. Use `matchMedia` for the
system preference without adding any setting.

- [ ] **Step 4: Add failing mobile sheet movement assertions**

Prove the mobile Kit workspace and filter sheet:

- remain mounted with `data-motion-phase="exiting"` after close;
- use `transform: translateY(100%)` to enter/exit;
- use no opacity transition;
- retain inert background and focus containment through exit;
- return focus after exit.

- [ ] **Step 5: Add failing desktop displacement assertions**

At 1440 CSS pixels:

```ts
expect(workspaceBox.left).toBeGreaterThanOrEqual(catalogMainBox.right - 1);
expect(
  await page.locator(".project-card").evaluateAll((cards) =>
    cards.every((card) => {
      const rect = card.getBoundingClientRect();
      return rect.right <=
        document.querySelector(".kit-workspace")!.getBoundingClientRect().left;
    }),
  ),
).toBe(true);
```

Open and collapse the workspace and assert the third grid track transitions
between 48 pixels and 280–340 pixels. Start a project drag during expansion and
assert geometry snaps to the final open state before target measurement.

- [ ] **Step 6: Implement surface and desktop layout motion**

Mobile:

- entire sheet translates from/to the bottom over 220 milliseconds;
- no opacity fade;
- safe-area padding moves with the sheet;
- call `useModalSurface` with presence rather than domain visibility so inert
  background, focus containment, and focus return remain correct through exit.

Desktop:

- use one interpolable third grid track;
- animate 48 pixels to `clamp(280px, 22vw, 340px)`;
- keep the workspace in normal grid flow;
- reflow catalog cards without overlap;
- apply a `catalog-drag-active` state that disables the track transition and
  snaps it open before catalog drag geometry is measured.

Tablet keeps the approved overlay and touch rules.

- [ ] **Step 7: Run Task 6 tests and verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/transition-presence.test.tsx tests/unit/kit-workspace.test.tsx tests/unit/modal-surface.test.tsx tests/unit/kit-filter-panel.test.tsx
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e -- --grep "sheet movement|desktop workspace displacement|mode-local"
```

- [ ] **Step 8: Commit Task 6**

```powershell
git add -- src/hooks/use-transition-presence.ts src/features/catalog/components/catalog-page.tsx src/features/catalog/components/filter-panel.tsx src/features/kits/components/kit-filter-panel.tsx src/features/kits/components/kit-workspace.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/transition-presence.test.tsx tests/unit/kit-workspace.test.tsx tests/kits-e2e/kits.spec.ts
git commit -m "feat(kits): animate workspace surfaces"
```

---

### Task 7: Documentation, Integrated Workflows, and Visual Proof

**Files:**

- Modify: `docs/superpowers/specs/2026-07-24-kits-design.md`
- Modify: `docs/superpowers/specs/2026-07-24-kits-mobile-design.md`
- Modify: `docs/superpowers/plans/2026-07-24-kits-mobile.md`
- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts`
- Replace:
  `tests/kits-e2e/kits.visual.spec.ts-snapshots/*.png`

**Interfaces:**

- Consumes every production contract from Tasks 1–6.
- Produces one consistent documentation set and complete browser proof.

- [ ] **Step 1: Reconcile the earlier approved documents**

Update the base and mobile specs in place:

- exactly one Frontend, pinned first;
- remove Move up/down, Remove text, touch-no-drag, and Undo requirements;
- link to the approved motion/direct-manipulation spec;
- state desktop drag-off plus `×` and touch reorder plus `×`;
- retain all unrelated approved decisions.

Mark the old mobile implementation plan's tap-first Task 3/5 interaction steps
as superseded by this plan. Remove the premature “Execution status: Complete”
line until final verification is complete.

- [ ] **Step 2: Add the complete failing desktop workflow**

In one fixture session:

1. create a draft;
2. drag a Frontend into the pinned slot;
3. drag two non-Frontends into the stack;
4. replace the Frontend by drag;
5. reorder through a physical gap;
6. cancel one drag with Escape;
7. drag a project outside, verify **Release to remove**, return inside, and
   verify cancellation;
8. drag outside again and release to remove;
9. remove another project with `×`;
10. prove no editor/catalog overlap.

- [ ] **Step 3: Add the complete failing mobile workflow**

At 390 by 844:

1. create and collapse a draft;
2. use Add/Use instead for the single Frontend;
3. add three non-Frontends;
4. reopen through the draft pill;
5. reorder with the handle;
6. verify drag never arms removal;
7. remove with `×`;
8. verify no Undo/remove bar;
9. close through the whole-sheet exit and verify focus return.

- [ ] **Step 4: Run both workflows and verify state transitions**

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e -- --grep "complete desktop direct-manipulation workflow|complete mobile direct-manipulation workflow"
```

If either test is immediately green, inspect it to ensure each gesture changes
and observes state rather than checking only element presence.

- [ ] **Step 5: Update visual cases**

Capture and inspect:

- desktop catalog with in-flow open workspace;
- desktop pinned Frontend and three-project stack;
- desktop active physical reorder gap;
- desktop **Release to remove** danger state;
- mobile empty Frontend slot;
- mobile populated compact Frontend and stack;
- mobile handle-reorder state;
- mobile whole-sheet open;
- existing filters, inspection, long-stack, and draft-pill cases.

Do not capture mid-transition blur. Freeze only the explicit interaction state,
not the global animation clock.

- [ ] **Step 6: Generate and verify fixture baselines**

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-visual -- --update-snapshots
npm.cmd run test:kits-visual
```

Open every changed PNG and reject covered cards, clipped controls, oversized
danger treatment, insertion lines, stale ghosts, missing handles, or
horizontal overflow.

- [ ] **Step 7: Run documentation and focused regression tests**

Run:

```powershell
npx.cmd prettier --check docs/superpowers/specs/2026-07-24-kits-design.md docs/superpowers/specs/2026-07-24-kits-mobile-design.md docs/superpowers/specs/2026-07-24-kits-motion-interaction-design.md docs/superpowers/plans/2026-07-24-kits-mobile.md docs/superpowers/plans/2026-07-24-kits-motion-interaction.md
npx.cmd vitest run tests/unit/kit-maintenance-docs.test.ts tests/unit/visual-alignment-contract.test.ts
```

- [ ] **Step 8: Commit Task 7**

```powershell
git add -- docs/superpowers/specs/2026-07-24-kits-design.md docs/superpowers/specs/2026-07-24-kits-mobile-design.md docs/superpowers/plans/2026-07-24-kits-mobile.md tests/kits-e2e/kits.spec.ts tests/kits-e2e/kits.visual.spec.ts tests/kits-e2e/kits.visual.spec.ts-snapshots
git commit -m "test(kits): prove tactile workflows"
```

---

### Task 8: Complete Verification and Production Restoration

**Files:**

- Verify: every changed source, test, documentation, fixture, and snapshot file
- Verify: `data/registry/kits/`

**Interfaces:**

- Consumes: the complete branch.
- Produces: fresh completion evidence and a clean production export.

- [ ] **Step 1: Run formatting and static checks**

Run:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
git diff --check
```

- [ ] **Step 2: Run the complete unit and production gate**

Run:

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
```

Record exact file/test counts. Confirm the production build reports 214
projects and zero Kits.

- [ ] **Step 3: Run the complete fixture gate**

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
```

Record exact Playwright counts.

- [ ] **Step 4: Restore and prove production registry state**

Run:

```powershell
npm.cmd run catalog:build
Get-ChildItem data/registry/kits -Force
git status --short
```

Confirm `data/registry/kits/` contains only `.gitkeep`, generated production
data contains zero Kits, and no fixture source or generated fixture output
remains.

- [ ] **Step 5: Inspect the complete diff**

Run:

```powershell
git diff --check
git status --short
git log --oneline --decorate -12
```

Confirm:

- no Move up/down or Remove text controls;
- no Undo code;
- no animation dependency;
- no placeholders;
- no unrelated edits;
- no uncommitted files.

- [ ] **Step 6: Request code review**

Use `superpowers:requesting-code-review`. Reproduce every actionable finding
with a failing test before applying a fix. Rerun the affected focused tests and
the complete applicable gate.

- [ ] **Step 7: Verify before completion**

Use `superpowers:verification-before-completion`. Rerun any command whose
output is stale after review fixes.

- [ ] **Step 8: Finish the branch**

Use `superpowers:finishing-a-development-branch`. Report exact fresh test
counts and offer the branch-integration choices.
