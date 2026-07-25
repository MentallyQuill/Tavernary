# Kits Controls, Builder, and Batch Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task inline. Do
> not dispatch implementation subagents. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Bring Kits controls and the Kit Builder into Tavernary's visual
system while replacing per-card Add to Kit buttons with a non-interruptive,
accessible batch-selection flow that preserves desktop drag-and-drop.

**Architecture:** Add two focused UI primitives (`DualRange` and the project
selection dock), isolate batch composition in a pure domain helper, and keep
transient pointer/keyboard selection in a dedicated hook. Rename the current
workspace component and hook in place, then expose one atomic batch-add
operation that creates or updates a collapsed draft without changing catalog
navigation, scroll, or focus.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, CSS custom properties,
Vitest, Testing Library, and Playwright.

## Global Constraints

- Execute inline in this session; do not dispatch implementation subagents.
- Before production edits, use `superpowers:using-git-worktrees` to place
  `codex/kits-ui-refinement` in an isolated worktree.
- Follow strict red-green-refactor TDD for every behavioral task.
- Add no runtime or animation-library dependency.
- Use **Kit Builder** in all user-facing and accessibility-facing copy; no
  **Kit Workspace** compatibility aliases are required.
- Preserve the desktop grab-handle drag path and approved reorder/removal
  behavior.
- Remove every per-card Add to Kit button.
- Long press activates after 450ms and cancels after more than 8 CSS pixels of
  movement.
- Kit capacity remains 50 projects and one Frontend.
- Applying a batch must not open, expand, focus, or scroll to the Kit Builder.
- Do not add undo behavior.
- Motion stays practical and restrained at approximately 120–180ms.
- Standard `prefers-reduced-motion` handling is an accessibility adaptation,
  not a user-facing mode.
- Use the supplied `C:\Users\Keptin\Downloads\kits.svg` path geometry, sanitized
  to `currentColor`, without fixed dimensions or generator comments.
- Preserve the production card minimums: 320px standard and 255px compact.

---

## File Structure

### New Files

- `src/components/ui/dual-range.tsx` — one visual track backed by two
  accessible range inputs.
- `src/features/kits/project-batch.ts` — pure one-Frontend, deduplication, order,
  and capacity planning.
- `src/features/kits/use-project-batch-selection.ts` — transient selection and
  long-press/keyboard state.
- `src/features/kits/components/project-selection-dock.tsx` — Cancel, Add to
  Kit, tally, and guidance surface.
- `src/features/kits/components/kit-draft-access.tsx` — collapsed rail and
  mobile draft-pill content/status.
- `tests/unit/dual-range.test.tsx`
- `tests/unit/project-batch.test.ts`
- `tests/unit/project-batch-selection.test.tsx`
- `tests/unit/project-selection-dock.test.tsx`
- `tests/unit/kit-draft-access.test.tsx`

### Renamed Files

- `src/features/kits/components/kit-workspace.tsx` →
  `src/features/kits/components/kit-builder-panel.tsx`
- `src/features/kits/use-kit-workspace.ts` →
  `src/features/kits/use-kit-builder.ts`
- `tests/unit/kit-workspace.test.tsx` →
  `tests/unit/kit-builder-panel.test.tsx`

### Modified Files

- `src/components/icons/category-icon.tsx`
- `src/features/catalog/components/catalog-page.tsx`
- `src/features/catalog/components/catalog-toolbar.tsx`
- `src/features/catalog/components/project-card.tsx`
- `src/features/catalog/components/project-grid.tsx`
- `src/features/kits/components/kit-filter-panel.tsx`
- `src/features/kits/components/kit-builder.tsx`
- `src/features/kits/components/kit-builder-row.tsx`
- `src/features/kits/components/kit-frontend-slot.tsx`
- `src/features/kits/kit-types.ts`
- `src/styles/catalog.css`
- `src/styles/responsive.css`
- `src/styles/motion.css`
- `tests/unit/catalog-toolbar.test.tsx`
- `tests/unit/kit-builder.test.tsx`
- `tests/unit/visual-alignment-contract.test.ts`
- `tests/e2e/kits-builder-mobile.spec.ts`
- `tests/kits-e2e/kits.spec.ts`
- `tests/kits-e2e/kits.visual.spec.ts`
- affected visual snapshots under `tests/visual` and `tests/kits-e2e`
- existing Kits specs that still use retired product terminology

---

### Task 1: Shared Controls, Kits Icon, and Kit Builder Rename

**Files:**

- Rename: `src/features/kits/components/kit-workspace.tsx` →
  `src/features/kits/components/kit-builder-panel.tsx`
- Rename: `src/features/kits/use-kit-workspace.ts` →
  `src/features/kits/use-kit-builder.ts`
- Rename: `tests/unit/kit-workspace.test.tsx` →
  `tests/unit/kit-builder-panel.test.tsx`
- Modify: `src/components/icons/category-icon.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/catalog/components/catalog-toolbar.tsx`
- Modify: `src/features/kits/components/kit-builder.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/unit/catalog-toolbar.test.tsx`
- Modify: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**

- Produces: `KitBuilderState`
- Produces: `useKitBuilder(options)`
- Produces: `KitBuilderPanel`
- Produces: `CategoryIcon` name `"kit-builder"`
- Produces shared CSS classes `.control-primary`, `.control-secondary`,
  `.control-quiet`, `.control-icon`, and `.control-select`

- [ ] **Step 1: Rename the test file and write failing naming/style contracts**

Use `Move-Item` only after verifying both paths resolve inside the isolated
worktree. Update imports and add assertions:

```tsx
expect(
  screen.getByRole("complementary", { name: "Kit Builder" }),
).toBeVisible();
expect(
  screen.getByRole("button", { name: "Collapse Kit Builder" }),
).toBeVisible();
expect(screen.queryByText(/Kit workspace/i)).not.toBeInTheDocument();
```

Add source contracts:

```ts
expect(toolbar).toContain('className="control-select sort-kits"');
expect(panel).toContain('className="control-primary"');
expect(panel).toContain('name="kit-builder"');
expect(css).not.toContain("writing-mode: vertical-rl");
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/kit-builder-panel.test.tsx tests/unit/catalog-toolbar.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because the component, copy, icon, and shared control classes do
not exist.

- [ ] **Step 3: Rename the production modules and exported types**

Rename without aliases:

```ts
export type KitBuilderState =
  | { mode: "intro"; collapsed: boolean }
  | { mode: "inspect"; collapsed: boolean; kitId: string }
  | {
      mode: "build";
      collapsed: boolean;
      draft: KitDraft;
      dirty: boolean;
    };

export function useKitBuilder({
  selectedKitId,
  onSelectKit,
}: {
  selectedKitId: string;
  onSelectKit: (kitId: string) => void;
}) {
  // Preserve the existing state transitions in the renamed hook.
}
```

Rename the DOM id and classes from `kit-workspace*` to `kit-builder-panel*`.
Update all imports, selectors, labels, and test references in one mechanical
pass.

- [ ] **Step 4: Add the sanitized Kit Builder icon**

Add this icon case using the supplied path geometry:

```tsx
case "kit-builder":
  return (
    <svg viewBox="0 0 1920 1920" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M1807.124.056V1920h-112.938V.056h112.938ZM1468.254 0v1919.944H282.407c-93.4 0-169.407-75.895-169.407-169.407V169.407C113 76.007 189.007 0 282.407 0h1185.847ZM830.607 661.138 588.242 903.503h654.137v112.938H588.242l242.365 242.477-79.847 79.847-378.793-378.793 378.793-378.68 79.847 79.846Z"
      />
    </svg>
  );
```

The collapsed rail uses the icon as authored; the expanded header adds a CSS
class that applies `transform: scaleX(-1)`.

- [ ] **Step 5: Add focused shared control treatments**

Define the five shared classes from the design:

```css
.control-primary {
  border: 1px solid var(--color-kind-extension);
  border-radius: 6px;
  color: var(--color-page);
  background: var(--color-kind-extension);
}

.control-secondary {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-secondary);
  background: var(--color-surface-card);
}

.control-quiet {
  border: 0;
  color: var(--color-muted);
  background: transparent;
}

.control-icon {
  display: grid;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-muted);
  background: var(--color-surface-primary);
  place-content: center;
}

.control-select {
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  padding: 0 31px 0 10px;
  color: var(--color-text-secondary);
  background: var(--color-surface-primary);
}
```

Include shared hover, disabled, and focus-visible states. Apply them to project
sort, Kits sort, Create Kit, Submit Kit, builder actions, and Clear Kit
Filters. Remove redundant Kits-only declarations after parity is proven.

- [ ] **Step 6: Build the readable collapsed rail**

Render one button with icon, label, and a reserved status slot:

```tsx
<button
  type="button"
  className="kit-builder-rail"
  aria-label={draftCount
    ? `Open Kit Builder, ${draftCount} projects in draft`
    : "Open Kit Builder"}
  onClick={onCollapse}
>
  <CategoryIcon name="kit-builder" />
  <span>Kit Builder</span>
  <span className="kit-builder-rail-status" aria-hidden="true">
    {draftCount ? `${draftCount} projects` : ""}
  </span>
</button>
```

Set the collapsed track to approximately 72px and retain layout displacement.
Do not use rotated or vertical text.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/kit-builder-panel.test.tsx tests/unit/catalog-toolbar.test.tsx tests/unit/visual-alignment-contract.test.ts tests/unit/kit-builder.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the rename and shared control foundation**

```powershell
git add src tests
git commit -m "refactor(kits): align builder controls"
```

---

### Task 2: Accessible Dual-Thumb Kit Size Range

**Files:**

- Create: `src/components/ui/dual-range.tsx`
- Create: `tests/unit/dual-range.test.tsx`
- Modify: `src/features/kits/components/kit-filter-panel.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/unit/kit-filter-panel.test.tsx`

**Interfaces:**

- Produces:

```ts
export type DualRangeValue = readonly [minimum: number, maximum: number];

export function DualRange(props: {
  label: string;
  minimumLabel: string;
  maximumLabel: string;
  min: number;
  max: number;
  step?: number;
  value: DualRangeValue;
  onChange: (value: DualRangeValue) => void;
}): JSX.Element;
```

- [ ] **Step 1: Write failing dual-range tests**

Cover rendering, clamping, and keyboard behavior:

```tsx
render(
  <DualRange
    label="Kit size"
    minimumLabel="Minimum projects"
    maximumLabel="Maximum projects"
    min={3}
    max={50}
    value={[8, 24]}
    onChange={onChange}
  />,
);

expect(screen.getByRole("slider", { name: "Minimum projects" })).toHaveValue(
  "8",
);
expect(screen.getByRole("slider", { name: "Maximum projects" })).toHaveValue(
  "24",
);
expect(screen.getByText("Min 8")).toBeVisible();
expect(screen.getByText("Max 24")).toBeVisible();
```

Assert that increasing minimum beyond 24 yields `[24, 24]`, decreasing maximum
below 8 yields `[8, 8]`, Page Up uses five steps, and Home/End respect the
other thumb.

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/dual-range.test.tsx tests/unit/kit-filter-panel.test.tsx
```

Expected: FAIL because `DualRange` is absent and the filter still exposes two
visual tracks and number inputs.

- [ ] **Step 3: Implement the minimal dual-range component**

Use two range inputs over one visual track:

```tsx
const minimumPercent = ((minimum - min) / (max - min)) * 100;
const maximumPercent = ((maximum - min) / (max - min)) * 100;

<fieldset className="dual-range">
  <legend>{label}</legend>
  <div className="dual-range-readouts" aria-hidden="true">
    <span>Min {minimum}</span>
    <span>Max {maximum}</span>
  </div>
  <div
    className="dual-range-track"
    style={{
      "--range-start": `${minimumPercent}%`,
      "--range-end": `${maximumPercent}%`,
    } as React.CSSProperties}
  >
    <input
      type="range"
      aria-label={minimumLabel}
      min={min}
      max={maximum}
      step={step}
      value={minimum}
      onChange={(event) =>
        onChange([Math.min(Number(event.target.value), maximum), maximum])
      }
    />
    <input
      type="range"
      aria-label={maximumLabel}
      min={minimum}
      max={max}
      step={step}
      value={maximum}
      onChange={(event) =>
        onChange([minimum, Math.max(Number(event.target.value), minimum)])
      }
    />
  </div>
  <span className="visually-hidden" aria-live="polite">
    {minimum} to {maximum} projects
  </span>
</fieldset>
```

Handle Page Up/Down and Home/End explicitly in `onKeyDown`; native arrow
behavior remains intact.

- [ ] **Step 4: Replace the two Kit filter rows**

Replace both visual range/number pairs with:

```tsx
<DualRange
  label="Kit size"
  minimumLabel="Minimum projects"
  maximumLabel="Maximum projects"
  min={3}
  max={50}
  value={[query.minProjects, query.maxProjects]}
  onChange={([minProjects, maxProjects]) =>
    onChange({ ...query, minProjects, maxProjects })
  }
/>
```

- [ ] **Step 5: Style one track and two touch-safe thumbs**

Use one pseudo-track with a mint selected segment. Keep the visual thumb near
18px and the input interaction layer at least 44px high under coarse pointers.
Ensure the active thumb receives the higher stacking order when ranges meet.

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/dual-range.test.tsx tests/unit/kit-filter-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the range**

```powershell
git add src/components/ui/dual-range.tsx src/features/kits/components/kit-filter-panel.tsx src/styles tests/unit
git commit -m "feat(kits): add dual size range"
```

---

### Task 3: Pure Batch Composition Domain

**Files:**

- Create: `src/features/kits/project-batch.ts`
- Create: `tests/unit/project-batch.test.ts`
- Modify: `src/features/kits/project-stack-order.ts`

**Interfaces:**

- Produces:

```ts
export type KitBatchPlan = {
  projectIds: string[];
  addedProjectIds: string[];
  skippedProjectIds: string[];
  replacedFrontendId: string | null;
  limitReached: boolean;
};

export function planKitProjectBatch(input: {
  draftProjectIds: string[];
  selectedProjectIds: string[];
  projects: Pick<CatalogProject, "id" | "kind">[];
  limit?: number;
}): KitBatchPlan;
```

- [ ] **Step 1: Write failing domain tests**

Create table-driven tests for:

```ts
expect(
  planKitProjectBatch({
    draftProjectIds: ["frontend-a", "memory"],
    selectedProjectIds: ["frontend-b", "preset", "memory"],
    projects,
  }),
).toEqual({
  projectIds: ["frontend-b", "memory", "preset"],
  addedProjectIds: ["frontend-b", "preset"],
  skippedProjectIds: ["memory"],
  replacedFrontendId: "frontend-a",
  limitReached: false,
});
```

Also prove:

- the final Frontend is first;
- selection order is retained for non-Frontends;
- duplicate selections add once;
- unknown project IDs are skipped;
- 47 existing plus four selected accepts three and sets `limitReached`;
- replacing a Frontend at capacity remains allowed; and
- `limit: 50` is the default.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-batch.test.ts
```

Expected: FAIL because `planKitProjectBatch` does not exist.

- [ ] **Step 3: Implement minimal deterministic planning**

Build maps once, separate the current Frontend from stack projects, process
selected IDs in order, and only consume capacity for net-new IDs. Return new
arrays without mutating inputs.

Do not import React or UI state. Reuse `replaceKitFrontend`, `addProject`, and
the existing Kit project-layout helpers where they preserve the exact
one-Frontend ordering contract.

- [ ] **Step 4: Verify GREEN and run adjacent domain tests**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-batch.test.ts tests/unit/project-stack-order.test.ts tests/unit/kit-project-layout.test.ts tests/unit/kit-domain.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the domain helper**

```powershell
git add src/features/kits/project-batch.ts src/features/kits/project-stack-order.ts tests/unit/project-batch.test.ts
git commit -m "feat(kits): plan project batches"
```

---

### Task 4: Long-Press and Keyboard Selection Hook

**Files:**

- Create: `src/features/kits/use-project-batch-selection.ts`
- Create: `tests/unit/project-batch-selection.test.tsx`

**Interfaces:**

- Consumes: `planKitProjectBatch`
- Produces:

```ts
export type ProjectSelectionBindings = {
  selected: boolean;
  inDraft: boolean;
  onPointerDown: React.PointerEventHandler<HTMLElement>;
  onPointerMove: React.PointerEventHandler<HTMLElement>;
  onPointerUp: React.PointerEventHandler<HTMLElement>;
  onPointerCancel: React.PointerEventHandler<HTMLElement>;
  onClick: React.MouseEventHandler<HTMLElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLElement>;
};

export function useProjectBatchSelection(input: {
  projects: CatalogProject[];
  draftProjectIds: string[];
  active: boolean;
  onApply: (projectIds: string[]) => KitBatchPlan;
}): {
  selectionMode: boolean;
  selectedProjectIds: string[];
  selectedCount: number;
  limitReached: boolean;
  replacementFrontendName: string | null;
  bindingsFor: (projectId: string) => ProjectSelectionBindings;
  clear: () => void;
  apply: () => KitBatchPlan | null;
};
```

- [ ] **Step 1: Write failing timer, movement, and keyboard tests**

Use fake timers:

```tsx
vi.useFakeTimers();
fireEvent.pointerDown(card, {
  pointerId: 1,
  button: 0,
  clientX: 100,
  clientY: 100,
});
act(() => vi.advanceTimersByTime(449));
expect(card).not.toHaveAttribute("aria-selected", "true");
act(() => vi.advanceTimersByTime(1));
expect(card).toHaveAttribute("aria-selected", "true");
```

Prove cancellation on:

- 9px movement;
- pointer-up before 450ms;
- pointer-cancel;
- scroll;
- unmount; and
- pointer-down originating in `[data-project-drag-handle]`.

Prove:

- `navigator.vibrate(10)` is requested only after activation;
- Space selects and Escape clears;
- a completed hold consumes the follow-up click;
- normal click remains unconsumed outside selection mode;
- second Frontend swaps the first selected Frontend;
- draft members cannot be selected;
- capacity failure leaves the card unselected; and
- hidden/unrendered selected IDs remain in hook state.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-batch-selection.test.tsx
```

Expected: FAIL because the hook is absent.

- [ ] **Step 3: Implement the press session**

Store one ref:

```ts
type PressSession = {
  projectId: string;
  pointerId: number;
  originX: number;
  originY: number;
  activated: boolean;
  timer: number;
};
```

Clear the timer and session through one idempotent `cancelPress()` function.
Use `window.setTimeout(..., 450)`. Cancel when squared distance exceeds `8 ** 2`
to avoid unnecessary square roots.

- [ ] **Step 4: Implement ordered selection and keyboard behavior**

Store selected IDs as an ordered array. In inactive mode, Space enters
selection; in active mode, Space or Enter toggles. Escape clears from the hook's
window key listener. Preserve normal Enter/click navigation only while
selection mode is inactive.

Use the batch planner for eligibility and messages rather than duplicating
Frontend/capacity logic.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-batch-selection.test.tsx tests/unit/project-batch.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the hook**

```powershell
git add src/features/kits/use-project-batch-selection.ts tests/unit/project-batch-selection.test.tsx
git commit -m "feat(kits): add batch selection state"
```

---

### Task 5: Selectable Project Cards Without Add Buttons

**Files:**

- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/features/catalog/components/project-grid.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/unit/project-card.test.tsx`
- Modify: `tests/unit/kit-builder.test.tsx`

**Interfaces:**

- Consumes: `ProjectSelectionBindings`
- Produces `ProjectGrid` props:

```ts
selection?: {
  mode: boolean;
  bindingsFor: (projectId: string) => ProjectSelectionBindings;
};
```

- [ ] **Step 1: Replace old Add-button tests with failing selection contracts**

Delete assertions that expect `Add <name> to Kit` or `<name> added to Kit`.
Add:

```tsx
expect(
  screen.queryByRole("button", { name: /Add .* to Kit/ }),
).not.toBeInTheDocument();
expect(cardShell).toHaveAttribute("aria-selected", "true");
expect(within(cardShell).getByLabelText("Selected")).toBeVisible();
expect(dragHandle).toHaveAttribute(
  "aria-label",
  "Drag Memory Tool into Kit",
);
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-card.test.tsx tests/unit/kit-builder.test.tsx
```

Expected: FAIL because Add buttons still render and card selection state is
absent.

- [ ] **Step 3: Remove Add-to-Kit rendering**

Delete the `onAddToKit` prop and `.add-to-kit` button from `ProjectGrid`.
Retain `.catalog-project-drag-handle` and mark it:

```tsx
data-project-drag-handle
```

- [ ] **Step 4: Add the selectable shell**

Apply bindings to the outer shell rather than nesting another interactive
button around the project anchor:

```tsx
<div
  className={`project-card-shell${bindings.selected ? " selected" : ""}`}
  role={selection.mode ? "option" : undefined}
  aria-selected={selection.mode ? bindings.selected : undefined}
  tabIndex={selection.mode ? 0 : undefined}
  {...pointerAndKeyboardBindings}
>
  <ProjectCard project={project} now={now} />
  {bindings.selected ? (
    <span className="project-selection-check" aria-label="Selected">
      ✓
    </span>
  ) : null}
  {dragHandle}
</div>
```

Prevent navigation only when the hook reports that selection consumed the
click.

- [ ] **Step 5: Style focus, selected, and in-draft as distinct states**

- selected: 2px mint outline plus raised surface;
- keyboard focus: existing focus-visible outline with offset;
- in draft: quiet text marker that does not resemble selection; and
- selected check: corner placement that cannot cover identity/activity facts.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-card.test.tsx tests/unit/kit-builder.test.tsx tests/unit/project-batch-selection.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the project-card interaction**

```powershell
git add src/features/catalog/components src/styles/catalog.css tests/unit
git commit -m "feat(kits): select catalog projects"
```

---

### Task 6: Atomic Background Draft Updates

**Files:**

- Modify: `src/features/kits/use-kit-builder.ts`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `tests/unit/kit-builder-panel.test.tsx`
- Create or modify: `tests/unit/kit-builder-state.test.tsx`

**Interfaces:**

- Consumes: `planKitProjectBatch`
- Produces:

```ts
applyProjectBatch(
  selectedProjectIds: string[],
  projects: CatalogProject[],
): KitBatchPlan;
```

- [ ] **Step 1: Write failing state-transition tests**

Prove:

```ts
const result = hook.result.current.applyProjectBatch(
  ["memory", "preset"],
  projects,
);

expect(result.addedProjectIds).toEqual(["memory", "preset"]);
expect(hook.result.current.state).toMatchObject({
  mode: "build",
  collapsed: true,
  dirty: true,
  draft: { projectIds: ["memory", "preset"] },
});
```

Also prove:

- no-draft intro and inspect states create a collapsed create draft;
- an expanded build draft stays expanded;
- a collapsed build draft stays collapsed;
- title, description, operation, and kit ID remain unchanged for an existing
  draft;
- Frontend replacement and capacity results match the domain plan; and
- empty/ineligible batches do not create or dirty a draft.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/kit-builder-state.test.tsx tests/unit/project-batch.test.ts
```

Expected: FAIL because `applyProjectBatch` is absent.

- [ ] **Step 3: Implement one synchronous plan plus one state update**

Compute from the current state and return the exact plan used for the update.
For no existing build draft, use:

```ts
{
  mode: "build",
  collapsed: true,
  dirty: true,
  draft: {
    operation: "create",
    kitId: null,
    title: "",
    description: "",
    projectIds: plan.projectIds,
  },
}
```

Do not call `startCreate()`, because it expands the builder and would require a
second update.

- [ ] **Step 4: Wire the selection hook in CatalogPage**

Pass the current build draft IDs or `[]`. On apply, call
`builder.applyProjectBatch`. Clear selection only after a non-null plan. Keep
query state, scroll, and focus untouched.

Clear selection in an effect when `query.mode !== "projects"` and on component
unmount.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/kit-builder-state.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/project-batch-selection.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the background update path**

```powershell
git add src/features/catalog/components/catalog-page.tsx src/features/kits/use-kit-builder.ts tests/unit
git commit -m "feat(kits): apply batches in background"
```

---

### Task 7: Selection Dock and Persistent Draft Access

**Files:**

- Create: `src/features/kits/components/project-selection-dock.tsx`
- Create: `src/features/kits/components/kit-draft-access.tsx`
- Create: `tests/unit/project-selection-dock.test.tsx`
- Create: `tests/unit/kit-draft-access.test.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `src/styles/motion.css`

**Interfaces:**

- Produces:

```ts
export function ProjectSelectionDock(props: {
  selectedCount: number;
  replacementFrontendName: string | null;
  limitReached: boolean;
  onCancel: () => void;
  onAdd: () => void;
}): JSX.Element;

export type DraftAccessStatus =
  | { phase: "settled"; draftCount: number }
  | { phase: "added"; addedCount: number; draftCount: number };

export function KitDraftAccess(props: {
  variant: "rail" | "pill";
  status: DraftAccessStatus | null;
  onOpen: () => void;
}): JSX.Element | null;
```

- [ ] **Step 1: Write failing dock tests**

Assert:

```tsx
expect(screen.getByRole("button", { name: "Add to Kit" })).toBeEnabled();
expect(screen.getByText("3")).toHaveClass("selection-count");
expect(screen.getByText("Frontend will replace Frontend A")).toBeVisible();
expect(screen.getByText("Kit limit reached · 50 projects")).toBeVisible();
```

Prove Cancel and Add call only their corresponding handlers.

- [ ] **Step 2: Write failing draft-access tests**

Cover:

- no draft renders nothing;
- rail accessible name includes the cumulative count;
- pill exposes Kits icon, `Kit draft`, and project count;
- added phase shows `3 projects added`;
- after 1600ms it settles to `7 projects in draft`; and
- activating either variant calls `onOpen`.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-selection-dock.test.tsx tests/unit/kit-draft-access.test.tsx
```

Expected: FAIL because both components are absent.

- [ ] **Step 4: Implement the selection dock**

Render one region:

```tsx
<section
  className="project-selection-dock"
  aria-label={`${selectedCount} projects selected`}
>
  <button className="control-quiet" type="button" onClick={onCancel}>
    Cancel
  </button>
  <button className="control-primary" type="button" onClick={onAdd}>
    Add to Kit
    <span className="selection-count" aria-hidden="true">
      {selectedCount}
    </span>
  </button>
  {guidance ? <small>{guidance}</small> : null}
</section>
```

The count remains separate visual content while the button's accessible name
stays concise.

- [ ] **Step 5: Implement one status lifecycle**

CatalogPage stores:

```ts
type AddedStatus = { addedCount: number; draftCount: number } | null;
```

After a successful plan, set the status and schedule one 1600ms transition to
settled state. Clear the timer on subsequent additions and unmount. Render one
`aria-live="polite"` message:

```text
3 projects added. 7 projects in draft.
```

This is confirmation, not undo.

- [ ] **Step 6: Integrate rail and mobile pill**

- desktop/tablet collapsed builder: `variant="rail"`;
- mobile collapsed build draft: `variant="pill"`;
- while mobile selection mode is active, hide the draft pill and show the
  selection dock;
- cancelling mobile selection restores the pill immediately;
- applying changes the same bottom surface from selection dock to added status
  and then settled pill; and
- desktop keeps the rail visible while the selection dock is present.

- [ ] **Step 7: Reserve layout space and add restrained motion**

Add a catalog-bottom spacer only while the dock is mounted. Use a
120–180ms opacity/translate transition and disable it under the standard
reduced-motion media query. Do not add spring, bounce, scale-pop, or toast
animation.

- [ ] **Step 8: Verify GREEN**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/project-selection-dock.test.tsx tests/unit/kit-draft-access.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/project-batch-selection.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit the dock and draft access**

```powershell
git add src/features/kits/components src/features/catalog/components/catalog-page.tsx src/styles tests/unit
git commit -m "feat(kits): add persistent draft access"
```

---

### Task 8: End-to-End Interaction and Responsive Contracts

**Files:**

- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `tests/e2e/kits-builder-mobile.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts`
- Modify: `tests/unit/workflows.test.ts` only if file paths affect workflow
  contracts
- Modify: affected snapshots in
  `tests/kits-e2e/kits.visual.spec.ts-snapshots`
- Modify: affected snapshots in
  `tests/visual/catalog.visual.spec.ts-snapshots`

**Interfaces:**

- Consumes every UI and state interface from Tasks 1–7.
- Produces browser-level proof of the complete approved flow.

- [ ] **Step 1: Write failing desktop Playwright scenarios**

Add tests that:

1. open All Projects with no draft;
2. hold one card body for at least 450ms;
3. click two more cards;
4. verify `Add to Kit` and tally `3`;
5. add without URL, scroll, search, or focus moving to the builder;
6. verify the collapsed rail reports three projects;
7. change search/filter, select another project, and add again;
8. verify the cumulative count is four;
9. open the rail and inspect the four ordered projects; and
10. prove no project tile contains an Add to Kit button.

Add a separate test that uses the grab handle to add and reorder a project,
proving drag remains intact.

- [ ] **Step 2: Write failing mobile Playwright scenarios**

Use a 390×844 viewport and prove:

- a vertical movement greater than 8px before 450ms scrolls without selecting;
- an intentional hold selects;
- later taps toggle;
- the floating dock and controls meet 44px targets;
- adding does not open the full-screen builder;
- the dock becomes `Kit draft · 3 projects`;
- another selection temporarily replaces the pill;
- the updated pill reports the cumulative total; and
- pressing the pill opens the full-screen Kit Builder.

- [ ] **Step 3: Run E2E tests and verify RED**

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
```

Expected: new scenarios FAIL until the complete integration and responsive CSS
are correct.

- [ ] **Step 4: Fix only integration gaps revealed by the scenarios**

Keep fixes within the approved components and domain boundaries. Do not add
alternate add buttons, automatic builder opening, persistent selection
storage, or new animation patterns.

- [ ] **Step 5: Run E2E tests and verify GREEN**

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
```

Expected: PASS.

- [ ] **Step 6: Add visual scenarios before updating snapshots**

Capture:

- shared Kits sort and clear-filter treatments;
- default and constrained dual range;
- expanded Kit Builder;
- collapsed rail without a draft;
- collapsed rail with settled count;
- selected extension, preset, and Frontend cards;
- desktop selection dock;
- mobile selection dock;
- mobile added status; and
- mobile settled draft pill.

Run once without updates and confirm expected visual failures.

- [ ] **Step 7: Update and inspect every affected snapshot**

Run:

```powershell
npm.cmd run test:kits-visual -- --update-snapshots
npm.cmd run test:visual -- --update-snapshots
```

Open every changed PNG and verify:

- no browser-default controls;
- no text rotation;
- no hidden cards behind the builder;
- no card-header overlap;
- no bottom-dock coverage of the final card;
- correct safe-area spacing; and
- selected/focus/in-draft states remain distinguishable.

- [ ] **Step 8: Run visual tests without update mode**

Run:

```powershell
npm.cmd run test:kits-visual
npm.cmd run test:visual
```

Expected: PASS with no regenerated files.

- [ ] **Step 9: Commit browser tests and approved baselines**

```powershell
git add tests
git commit -m "test(kits): prove batch builder flow"
```

---

### Task 9: Documentation Consistency and Complete Verification

**Files:**

- Modify: `docs/superpowers/specs/2026-07-24-kits-design.md`
- Modify: `docs/superpowers/specs/2026-07-24-kits-mobile-design.md`
- Modify: `docs/superpowers/specs/2026-07-24-kits-motion-interaction-design.md`
- Modify: `docs/maintenance/kits.md` if it names affected UI controls
- Modify: `README.md` only if it names Kit Workspace

**Interfaces:**

- Consumes the final production terminology and behavior.
- Produces one non-contradictory documentation set and final verification
  evidence.

- [ ] **Step 1: Write a failing terminology contract**

Add or update a documentation unit test that scans product and maintenance
documentation:

```ts
expect(productSources).not.toMatch(/Kit Workspace/i);
expect(productSources).toContain("Kit Builder");
expect(productSources).toContain("long press");
expect(productSources).toContain("Add to Kit");
```

Limit historical design references only when they are clearly marked as
superseded; current behavior sections must use Kit Builder.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/kit-maintenance-docs.test.ts
```

Expected: FAIL on retired terminology or missing batch-selection guidance.

- [ ] **Step 3: Reconcile the existing Kits documents**

Update current-behavior sections so they agree with the approved refinement:

- one dual-thumb track;
- Kit Builder naming;
- desktop drag preserved;
- per-card Add buttons removed;
- long-press/Space batch selection;
- background draft updates;
- desktop rail and mobile pill tally; and
- no undo or automatic opening.

- [ ] **Step 4: Verify documentation GREEN**

Run:

```powershell
npm.cmd exec vitest -- run tests/unit/kit-maintenance-docs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the complete repository gate**

Run:

```powershell
npm.cmd run check
```

Expected:

- formatting passes;
- lint passes;
- palette audit passes;
- production catalog validates and builds;
- TypeScript passes;
- every Vitest file passes;
- production build passes; and
- static export verification passes.

- [ ] **Step 6: Verify the production browser artifact**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run test:visual
```

Expected: all production E2E and visual tests pass, including the wide-card
overlap regression.

- [ ] **Step 7: Verify the Kits fixture artifact**

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
```

Expected: all fixture E2E and visual tests pass.

- [ ] **Step 8: Restore and verify the production export**

The fixture builder restores production catalog JSON but leaves the fixture
static export in `out`. Rebuild production:

```powershell
npm.cmd run build
npm.cmd run verify:export
```

Expected: production export passes.

- [ ] **Step 9: Inspect final repository state**

Run:

```powershell
git status --short
git diff --check
git log --oneline -12
```

Expected: only intended tracked changes are present, no merge markers or test
artifacts exist, and any whitespace notices are understood before commit.

- [ ] **Step 10: Commit documentation and final adjustments**

```powershell
git add README.md docs src tests
git commit -m "docs(kits): align builder guidance"
```

- [ ] **Step 11: Invoke completion review**

Use `superpowers:requesting-code-review`, address verified findings through
`superpowers:receiving-code-review`, rerun affected tests, then use
`superpowers:verification-before-completion`.

- [ ] **Step 12: Prepare branch handoff**

Use `superpowers:finishing-a-development-branch` only after the final clean
verification. Do not merge, push, or deploy without the user's explicit
instruction at that point.
