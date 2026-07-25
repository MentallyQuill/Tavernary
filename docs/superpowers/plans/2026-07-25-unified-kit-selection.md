# Unified Kit Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace desktop catalog drag-in and mobile long press with one always-visible orange `+ / −` card control, shared selection dock, synchronized Kit membership treatment, and immediate removal behavior at every viewport size.

**Architecture:** Keep pending selection in `useProjectBatchSelection` and Kit membership in the existing `useKitBuilder` workspace. Project cards render a sibling Kit-action button beside the GitHub anchor; `CatalogPage` coordinates auto-started drafts, atomic batch application, immediate member removal, live announcements, and responsive dock access. Remove the catalog drag controller completely while preserving contained desktop builder-row reordering.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript 6, CSS, Vitest, Testing Library, Playwright

## Global Constraints

- The authority is `docs/superpowers/specs/2026-07-25-unified-kit-selection-design.md`.
- The project-card body always opens the canonical GitHub URL.
- The Kit control is always visible and is a sibling of, never a descendant of, the project-card anchor.
- The visible orange control is approximately 26–28 CSS pixels; coarse-pointer targets are at least 44 by 44 CSS pixels.
- Available cards use `+`; pending and In-Kit cards use a pushed-in `−`.
- Pending selection uses the existing mint accent; Kit membership uses the orange Kit accent plus **In Kit**.
- The first `+` starts a collapsed, transient create draft but never opens, pulses, or highlights the Kit Builder.
- **Cancel** clears pending selection only; no bulk empty-Kit control is introduced.
- In-Kit card and builder-row `−` actions remove one project immediately with no confirmation or Undo.
- Desktop and mobile share component behavior, copy, labels, constraints, and state transitions; only responsive geometry differs.
- Desktop catalog drag-in, mobile long press, whole-card selection, selection checks, and builder `×` controls are removed.
- Desktop builder-row dragging remains available only for contained reordering; mobile keeps its current explicit ordering behavior.
- No dependency, backend, account, persistence, moderation, ranking, registry, or publication changes.
- Preserve pre-existing workspace edits in `src/styles/catalog.css`, `tests/kits-e2e/kits.spec.ts`, and the Kit Builder collapse-icon documents; inspect and merge around them rather than overwriting them.

---

## File Map

### Draft and selection state

- `src/features/kits/use-kit-builder.ts`: add selection-started draft lifecycle and immediate catalog removal.
- `src/features/kits/use-project-batch-selection.ts`: replace gesture bindings with explicit button state and activation.
- `src/features/kits/project-batch.ts`: retain the existing atomic batch planner and capacity/Frontend rules unchanged.

### Catalog presentation and orchestration

- `src/features/catalog/components/project-kit-control.tsx`: render the accessible orange `+ / −` button.
- `src/features/catalog/components/project-grid.tsx`: compose link, Kit control, badge, and visual state.
- `src/features/catalog/components/catalog-page.tsx`: connect selection lifecycle, membership removal, dock, status, and live announcements.
- `src/features/kits/components/project-selection-dock.tsx`: expose count-aware accessible copy.

### Builder presentation

- `src/features/kits/components/kit-builder-row.tsx`: replace `×` with the shared minus-box language.
- `src/features/kits/components/kit-frontend-slot.tsx`: use the same minus-box language for the pinned Frontend.
- `src/features/kits/components/kit-builder.tsx`: preserve removal focus and contained reorder behavior while removing catalog-drop state.
- `src/features/kits/components/kit-builder-panel.tsx`: remove catalog-drag plumbing.

### Removed catalog-drag implementation

- Delete `src/features/kits/use-catalog-project-drag.ts`.
- Delete `tests/unit/catalog-project-drag.test.tsx`.

### Styling and proof

- `src/styles/catalog.css`: card footer geometry, state borders, orange controls, builder minus controls, and legacy drag cleanup.
- `src/styles/responsive.css`: coarse-pointer target and shared dock/card geometry.
- `src/styles/motion.css`: keep reduced-motion coverage for the new control and remove obsolete selectors if present.
- `tests/unit/kit-builder.test.tsx`: workspace lifecycle and builder removal contracts.
- `tests/unit/project-batch-selection.test.tsx`: explicit button-driven selection contracts.
- `tests/unit/project-card.test.tsx`: link/button semantics and card states.
- `tests/unit/project-selection-dock.test.tsx`: count-aware dock semantics.
- `tests/unit/visual-alignment-contract.test.ts`: exact CSS and legacy-path absence.
- `tests/unit/kit-maintenance-docs.test.ts`: point maintenance coverage at the superseding design.
- `tests/kits-e2e/kits.spec.ts`: shared desktop/mobile selection, application, and removal flow.
- `tests/kits-e2e/kits.visual.spec.ts`: desktop and phone visual states.

---

### Task 1: Selection-Started Draft Lifecycle

**Files:**
- Modify: `src/features/kits/use-kit-builder.ts`
- Test: `tests/unit/kit-builder.test.tsx`

**Interfaces:**
- Consumes: existing `KitBuilderState`, `KitDraft`, `removeProject(projectIds, projectId)`.
- Produces: `startSelectionDraft(): void`,
  `discardUntouchedSelectionDraft(): void`, and
  `removeProjectFromDraft(projectId: string): boolean`.
- Invariant: manual `startCreate()` still opens the builder; selection-started creation is collapsed.

- [ ] **Step 1: Write failing workspace lifecycle tests**

Add focused tests beside the existing `useKitBuilder` tests:

```tsx
test("starts a collapsed untouched draft for card selection", () => {
  const { result } = renderHook(() =>
    useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
  );

  act(() => result.current.startSelectionDraft());

  expect(result.current.state).toMatchObject({
    mode: "build",
    collapsed: true,
    dirty: false,
    draft: {
      operation: "create",
      title: "",
      description: "",
      projectIds: [],
    },
  });
});

test("discards only an untouched empty selection-started draft", () => {
  const { result } = renderHook(() =>
    useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
  );

  act(() => result.current.startSelectionDraft());
  act(() => result.current.discardUntouchedSelectionDraft());
  expect(result.current.state.mode).toBe("intro");

  act(() => result.current.startSelectionDraft());
  act(() => result.current.updateDraft({ title: "Keep me" }));
  act(() => result.current.discardUntouchedSelectionDraft());
  expect(result.current.state.mode).toBe("build");
});

test("removes one draft project through the workspace", () => {
  const { result } = renderHook(() =>
    useKitBuilder({ selectedKitId: "", onSelectKit: vi.fn() }),
  );
  act(() => result.current.startCreate());
  act(() => result.current.updateDraft({ projectIds: ["frontend", "memory"] }));

  let removed = false;
  act(() => {
    removed = result.current.removeProjectFromDraft("memory");
  });

  expect(removed).toBe(true);
  expect(result.current.state).toMatchObject({
    mode: "build",
    dirty: true,
    draft: { projectIds: ["frontend"] },
  });
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder.test.tsx
```

Expected: FAIL because the three workspace methods do not exist.

- [ ] **Step 3: Implement the minimal lifecycle methods**

In `use-kit-builder.ts`, import `useRef` and `removeProject`, then track whether
the current empty create draft was started by selection:

```ts
const selectionStartedDraftRef = useRef(false);

const startSelectionDraft = useCallback(() => {
  if (state.mode === "build") return;
  selectionStartedDraftRef.current = true;
  setDraftOrigin("create");
  setOriginalProjectIds([]);
  setState({
    mode: "build",
    collapsed: true,
    dirty: false,
    draft: {
      operation: "create",
      kitId: null,
      title: "",
      description: "",
      projectIds: [],
    },
  });
}, [state.mode]);

const discardUntouchedSelectionDraft = useCallback(() => {
  if (!selectionStartedDraftRef.current) return;
  setState((current) => {
    if (
      current.mode !== "build" ||
      current.dirty ||
      current.draft.title ||
      current.draft.description ||
      current.draft.projectIds.length > 0
    ) {
      return current;
    }
    selectionStartedDraftRef.current = false;
    return { mode: "intro", collapsed: true };
  });
}, []);

const removeProjectFromDraft = useCallback((projectId: string) => {
  const removed =
    state.mode === "build" && state.draft.projectIds.includes(projectId);
  if (!removed) return false;
  setState((current) => {
    if (
      current.mode !== "build" ||
      !current.draft.projectIds.includes(projectId)
    ) {
      return current;
    }
    return {
      ...current,
      dirty: true,
      draft: {
        ...current.draft,
        projectIds: removeProject(current.draft.projectIds, projectId),
      },
    };
  });
  return removed;
}, [state]);
```

Set `selectionStartedDraftRef.current = false` in `startCreate`,
`startDuplicate`, `startEdit`, and after a batch adds its first project. Return
the three methods from the hook.

- [ ] **Step 4: Run workspace tests and typecheck**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder.test.tsx
npm.cmd run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the lifecycle slice**

```powershell
git add -- src/features/kits/use-kit-builder.ts tests/unit/kit-builder.test.tsx
git commit -m "feat(kits): add selection draft lifecycle"
```

---

### Task 2: Explicit Card Selection Controller and Control

**Files:**
- Create: `src/features/catalog/components/project-kit-control.tsx`
- Modify: `src/features/kits/use-project-batch-selection.ts`
- Modify: `src/features/catalog/components/project-grid.tsx`
- Test: `tests/unit/project-batch-selection.test.tsx`
- Test: `tests/unit/project-card.test.tsx`

**Interfaces:**
- Consumes: `planKitProjectBatch(...)` and the workspace callbacks produced by Task 1.
- Produces:

```ts
export type ProjectKitControlState = "available" | "selected" | "in-kit";

export type ProjectSelectionBindings = {
  state: ProjectKitControlState;
  disabled: boolean;
  disabledReason: string | null;
  onActivate: () => void;
};
```

- `useProjectBatchSelection` adds callbacks:

```ts
onFirstSelection: () => void;
onSelectionEmpty: () => void;
onRemoveFromDraft: (projectId: string) => boolean;
onStatus: (message: string) => void;
```

- The hook also returns
  `selectedFrontendName: string | null` beside the existing
  `replacementFrontendName`.

- [ ] **Step 1: Replace gesture tests with explicit activation tests**

Delete long-press, pointer-movement, drag-handle exclusion, vibration, and
whole-card click cases from `project-batch-selection.test.tsx`. Add:

```tsx
test("uses one explicit activation path for select and deselect", async () => {
  const user = userEvent.setup();
  const onFirstSelection = vi.fn();
  const onSelectionEmpty = vi.fn();
  render(
    <SelectionHarness
      onFirstSelection={onFirstSelection}
      onSelectionEmpty={onSelectionEmpty}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Toggle memory" }));
  expect(onFirstSelection).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("1");

  await user.click(screen.getByRole("button", { name: "Toggle memory" }));
  expect(onSelectionEmpty).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
});

test("removes an In-Kit project instead of selecting it", async () => {
  const user = userEvent.setup();
  const onRemoveFromDraft = vi.fn();
  render(
    <SelectionHarness
      draftProjectIds={["memory"]}
      onRemoveFromDraft={onRemoveFromDraft}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Toggle memory" }));

  expect(onRemoveFromDraft).toHaveBeenCalledWith("memory");
  expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
});
```

In `project-card.test.tsx`, replace the obsolete “does not render per-card Add
to Kit controls” case with:

```tsx
test("keeps the Kit control outside the GitHub link", () => {
  const { container } = render(
    <ProjectGrid
      projects={[project("memory-tool", { name: "Memory Tool" })]}
      now="2026-07-23T00:00:00Z"
      selection={{
        bindingsFor: () => ({
          state: "available",
          disabled: false,
          disabledReason: null,
          onActivate: vi.fn(),
        }),
      }}
    />,
  );

  const link = screen.getByRole("link", { name: "Memory Tool" });
  const button = screen.getByRole("button", {
    name: "Add Memory Tool to Kit",
  });
  expect(link).not.toContainElement(button);
  expect(container.querySelector(".project-card-shell")).toContainElement(link);
  expect(container.querySelector(".project-card-shell")).toContainElement(
    button,
  );
});
```

- [ ] **Step 2: Run the two focused suites to verify failure**

Run:

```powershell
npx.cmd vitest run tests/unit/project-batch-selection.test.tsx tests/unit/project-card.test.tsx
```

Expected: FAIL on the missing explicit bindings and missing Kit button.

- [ ] **Step 3: Implement button-driven bindings**

Remove `PressSession`, timers, pointer handlers, `navigator.vibrate`, click
suppression, scroll cancellation, and shell keyboard handlers from
`use-project-batch-selection.ts`.

Implement `bindingsFor(projectId)` around one activation:

```ts
const selected = activeSelectedProjectIds.includes(projectId);
const inDraft = draftProjectIds.includes(projectId);
const candidatePlan = planKitProjectBatch({
  draftProjectIds,
  selectedProjectIds: [...activeSelectedProjectIds, projectId],
  projects,
});
const disabled =
  !selected && !inDraft && !candidatePlan.addedProjectIds.includes(projectId);

return {
  state: inDraft ? "in-kit" : selected ? "selected" : "available",
  disabled,
  disabledReason: disabled ? "Kit limit reached · 50 projects" : null,
  onActivate: () => {
    if (!active || disabled) return;
    if (inDraft) {
      if (onRemoveFromDraft(projectId)) {
        onStatus(`${project?.name ?? projectId} removed from Kit`);
      }
      return;
    }
    if (!selected && activeSelectedProjectIds.length === 0) onFirstSelection();
    toggleProject(projectId);
  },
};
```

Derive and return:

```ts
const selectedFrontendName = selectedFrontend?.name ?? null;
```

Call `onSelectionEmpty()` when deselection makes the selected-ID array empty and
from `clear()`, but do not call it when `clear()` receives an already-empty
selection. Emit `${project.name} selected`, `${project.name} removed from
selection`, and `Kit limit reached; 50 projects` through `onStatus`. Keep Escape
mapped to `clear()` while selection is non-empty.

- [ ] **Step 4: Create the semantic Kit control and compose it in the grid**

Create `project-kit-control.tsx`:

```tsx
import type { ProjectKitControlState } from "@/features/kits/use-project-batch-selection";

export function ProjectKitControl({
  projectName,
  state,
  disabled,
  disabledReason,
  onActivate,
}: {
  projectName: string;
  state: ProjectKitControlState;
  disabled: boolean;
  disabledReason: string | null;
  onActivate: () => void;
}) {
  const action =
    state === "available"
      ? `Add ${projectName} to Kit`
      : state === "selected"
        ? `Remove ${projectName} from selection`
        : `Remove ${projectName} from Kit`;

  return (
    <button
      type="button"
      className="project-kit-control"
      aria-label={action}
      aria-pressed={state !== "available"}
      aria-description={disabledReason ?? undefined}
      disabled={disabled}
      onClick={onActivate}
    >
      <span aria-hidden="true">{state === "available" ? "+" : "−"}</span>
    </button>
  );
}
```

Update `ProjectGrid` to always require `selection.bindingsFor`, render the
button after `ProjectCard` inside a sibling
`<span className="project-kit-control-hit">`, retain **In Kit** for
`state === "in-kit"`, and remove the upper-corner selection check. Apply
`selected` and `in-draft` classes from `state`.

- [ ] **Step 5: Run component tests and typecheck**

Run:

```powershell
npx.cmd vitest run tests/unit/project-batch-selection.test.tsx tests/unit/project-card.test.tsx
npm.cmd run typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit the explicit-control slice**

```powershell
git add -- src/features/catalog/components/project-kit-control.tsx src/features/catalog/components/project-grid.tsx src/features/kits/use-project-batch-selection.ts tests/unit/project-batch-selection.test.tsx tests/unit/project-card.test.tsx
git commit -m "feat(kits): add unified card controls"
```

---

### Task 3: Catalog Orchestration and Legacy Drag Removal

**Files:**
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Modify: `src/features/kits/components/kit-builder.tsx`
- Delete: `src/features/kits/use-catalog-project-drag.ts`
- Delete: `tests/unit/catalog-project-drag.test.tsx`
- Test: `tests/unit/kit-builder.test.tsx`
- Test: `tests/unit/project-batch-selection.test.tsx`

**Interfaces:**
- Consumes: `startSelectionDraft`, `discardUntouchedSelectionDraft`,
  `removeProjectFromDraft`, and `ProjectSelectionBindings`.
- Produces: one `CatalogPage` orchestration path with no catalog drag state or
  drag ghost.

- [ ] **Step 1: Add failing integration assertions**

Add a source-level regression in `project-batch-selection.test.tsx`:

```ts
test("the catalog selection implementation has no long-press session", async () => {
  const source = await readFile(
    "src/features/kits/use-project-batch-selection.ts",
    "utf8",
  );
  expect(source).not.toContain("PressSession");
  expect(source).not.toContain("setTimeout");
  expect(source).not.toContain("navigator.vibrate");
});
```

Add a source-level regression beside the existing Kit builder architecture
checks:

```ts
test("the catalog page has no project drag controller", async () => {
  const source = await readFile(
    "src/features/catalog/components/catalog-page.tsx",
    "utf8",
  );
  expect(source).not.toContain("useCatalogProjectDrag");
  expect(source).not.toContain("catalog-project-drag-ghost");
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```powershell
npx.cmd vitest run tests/unit/project-batch-selection.test.tsx tests/unit/kit-builder.test.tsx
```

Expected: FAIL while the catalog drag controller and ghost remain.

- [ ] **Step 3: Wire the unified selection callbacks in `CatalogPage`**

Pass:

```tsx
const batchSelection = useProjectBatchSelection({
  projects: catalog.projects,
  draftProjectIds: buildState?.draft.projectIds ?? [],
  active: query.mode === "projects",
  onFirstSelection: workspace.startSelectionDraft,
  onSelectionEmpty: workspace.discardUntouchedSelectionDraft,
  onRemoveFromDraft: workspace.removeProjectFromDraft,
  onStatus: setSelectionAnnouncement,
  onApply: (projectIds) =>
    workspace.applyProjectBatch(projectIds, catalog.projects),
});
```

Always pass the selection bindings to `ProjectGrid`. Remove
`onProjectDragStart`, `touchLayout`, `catalogLayoutRef`, drag-active layout
classes, the drag ghost, and the imports used only by catalog dragging.

- [ ] **Step 4: Remove catalog-drag plumbing from the builder**

Remove `CatalogProjectDragState`, `catalogDragState`, Frontend drop-state
branches, and stack drop-state branches from `KitBuilder` and
`KitBuilderPanel`. Preserve `useProjectStackDrag`, its desktop reorder/remove
behavior, keyboard reorder, and mobile ordering behavior unchanged.

Delete:

```text
src/features/kits/use-catalog-project-drag.ts
tests/unit/catalog-project-drag.test.tsx
```

- [ ] **Step 5: Run the affected suites and typecheck**

Run:

```powershell
npx.cmd vitest run tests/unit/project-batch-selection.test.tsx tests/unit/project-card.test.tsx tests/unit/kit-builder.test.tsx tests/unit/kit-builder-panel.test.tsx
npm.cmd run typecheck
```

Expected: all tests and typecheck PASS; no import references
`use-catalog-project-drag`.

- [ ] **Step 6: Commit orchestration and legacy removal**

```powershell
git add -- src/features/catalog/components/catalog-page.tsx src/features/kits/components/kit-builder-panel.tsx src/features/kits/components/kit-builder.tsx src/features/kits/use-catalog-project-drag.ts tests/unit/catalog-project-drag.test.tsx tests/unit/kit-builder.test.tsx tests/unit/project-batch-selection.test.tsx
git commit -m "refactor(kits): remove catalog drag selection"
```

---

### Task 4: Shared Dock Semantics and Live Status

**Files:**
- Modify: `src/features/kits/components/project-selection-dock.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/kits/components/kit-draft-access.tsx`
- Test: `tests/unit/project-selection-dock.test.tsx`
- Test: `tests/unit/kit-draft-access.test.tsx`

**Interfaces:**
- Consumes: `selectedCount`, `AddedStatus`, and existing draft-access variants.
- Produces: count-aware **Add to Kit** accessible name and consistent selected,
  added, removed, and draft-count announcements.

- [ ] **Step 1: Add failing accessible-copy tests**

Update the dock assertions:

```tsx
expect(
  screen.getByRole("button", { name: "Add 3 projects to Kit" }),
).toBeEnabled();
expect(
  screen.getByRole("region", { name: "3 projects selected" }),
).toBeVisible();
```

Add a singular case:

```tsx
render(
  <ProjectSelectionDock
    selectedCount={1}
    replacementFrontendName={null}
    limitReached={false}
    onCancel={vi.fn()}
    onAdd={vi.fn()}
  />,
);
expect(
  screen.getByRole("button", { name: "Add 1 project to Kit" }),
).toBeEnabled();
```

Retain tests for **Cancel**, replacement guidance, the 50-project limit, and
“Nothing can be added.”

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```powershell
npx.cmd vitest run tests/unit/project-selection-dock.test.tsx tests/unit/kit-draft-access.test.tsx
```

Expected: dock tests FAIL on the missing count-aware accessible name.

- [ ] **Step 3: Implement shared dock and announcement copy**

In `ProjectSelectionDock`, compute:

```ts
const projectLabel = `${selectedCount} ${
  selectedCount === 1 ? "project" : "projects"
}`;
```

Keep visible **Add to Kit** plus the count badge and set
`aria-label={`Add ${projectLabel} to Kit`}`.

In `CatalogPage`, add a single announcement string for:

- `_project_ selected`
- `_project_ removed from selection`
- `_n_ projects added; _m_ projects in draft`
- `_project_ removed from Kit`
- `Kit limit reached; 50 projects`
- `_new frontend_ will replace _old frontend_`

Drive the existing atomic live region from that string. Do not duplicate
visible toast UI.

Use one state value and preserve the replacement names before `apply()` clears
the selection:

```tsx
const [selectionAnnouncement, setSelectionAnnouncement] = useState("");

const addSelectedProjects = () => {
  const replacedFrontend = batchSelection.replacementFrontendName;
  const selectedFrontend = batchSelection.selectedFrontendName;
  const plan = batchSelection.apply();
  if (!plan || plan.addedProjectIds.length === 0) return;

  setSelectionAnnouncement(
    replacedFrontend && selectedFrontend
      ? `${selectedFrontend} replaced ${replacedFrontend}. ${projectCountLabel(
          plan.projectIds.length,
        )} in draft.`
      : `${projectCountLabel(plan.addedProjectIds.length)} added. ${projectCountLabel(
          plan.projectIds.length,
        )} in draft.`,
  );
  setAddedStatus({
    addedCount: plan.addedProjectIds.length,
    draftCount: plan.projectIds.length,
  });
};
```

Pass `setSelectionAnnouncement` as the selection hook's `onStatus`. Render only
`selectionAnnouncement` in the atomic live region; `addedStatus` remains the
visual rail/pill transition source.

- [ ] **Step 4: Run dock, draft-access, and selection tests**

Run:

```powershell
npx.cmd vitest run tests/unit/project-selection-dock.test.tsx tests/unit/kit-draft-access.test.tsx tests/unit/project-batch-selection.test.tsx
npm.cmd run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Commit dock and status semantics**

```powershell
git add -- src/features/kits/components/project-selection-dock.tsx src/features/catalog/components/catalog-page.tsx src/features/kits/components/kit-draft-access.tsx tests/unit/project-selection-dock.test.tsx tests/unit/kit-draft-access.test.tsx
git commit -m "feat(kits): unify selection dock semantics"
```

---

### Task 5: Builder Minus-Box Removal Language

**Files:**
- Modify: `src/features/kits/components/kit-builder-row.tsx`
- Modify: `src/features/kits/components/kit-frontend-slot.tsx`
- Modify: `src/features/kits/components/kit-builder.tsx`
- Test: `tests/unit/kit-builder.test.tsx`

**Interfaces:**
- Consumes: existing `onRemove(projectId)` and `removeImmediately(projectId)`.
- Produces: consistent **Remove _project_ from Kit** controls using `−`.

- [ ] **Step 1: Write failing builder-control assertions**

Replace the glyph and label assertions:

```tsx
const removeMemory = screen.getByRole("button", {
  name: "Remove Memory from Kit",
});
expect(removeMemory).toHaveTextContent("−");
expect(removeMemory).toHaveAttribute("aria-pressed", "true");
expect(screen.queryByText("×")).not.toBeInTheDocument();
```

Add the same expectations for the pinned Frontend:

```tsx
const removeFrontend = screen.getByRole("button", {
  name: "Remove Frontend from Kit",
});
expect(removeFrontend).toHaveTextContent("−");
expect(removeFrontend).toHaveAttribute("aria-pressed", "true");
```

Retain the existing focus-following test after immediate row removal.

- [ ] **Step 2: Run builder tests to verify failure**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder.test.tsx
```

Expected: FAIL because builder controls still render `×` and shorter labels.

- [ ] **Step 3: Implement the shared minus language**

Change both removal buttons to:

```tsx
<button
  type="button"
  className="kit-builder-remove"
  aria-label={`Remove ${project.name} from Kit`}
  aria-pressed="true"
  onClick={() => onRemove(project.id)}
>
  <span aria-hidden="true">−</span>
</button>
```

Use the corresponding Frontend name and callback in `KitFrontendSlot`. Keep
the `kit-builder-remove` class so the existing focus-transfer query in
`KitBuilder` remains valid.

- [ ] **Step 4: Run builder suites and typecheck**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder.test.tsx tests/unit/kit-builder-panel.test.tsx
npm.cmd run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Commit the builder language**

```powershell
git add -- src/features/kits/components/kit-builder-row.tsx src/features/kits/components/kit-frontend-slot.tsx src/features/kits/components/kit-builder.tsx tests/unit/kit-builder.test.tsx
git commit -m "feat(kits): unify builder remove controls"
```

---

### Task 6: Responsive Card, State, and Dock Styling

**Files:**
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `src/styles/motion.css`
- Test: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**
- Consumes: `.project-kit-control`, `.selected`, `.in-draft`,
  `.project-selection-dock`, and `.kit-builder-remove`.
- Produces: the approved footer geometry, visual states, hit targets, and
  responsive dock placement.

- [ ] **Step 1: Write failing visual-contract assertions**

Replace obsolete selection-check and catalog-drag assertions with:

```ts
expect(css).toMatch(
  /\.project-card-shell\.selected \.project-card\s*\{[^}]*outline:\s*2px solid var\(--color-kind-preset\)/s,
);
expect(css).toMatch(
  /\.project-card-shell\.in-draft \.project-card\s*\{[^}]*border-color:\s*var\(--color-kind-extension\)/s,
);
expect(css).toMatch(
  /\.project-kit-control-hit\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*4px[^}]*left:\s*4px/s,
);
expect(css).toMatch(
  /\.project-kit-control\s*\{[^}]*background:\s*var\(--color-kind-extension\)/s,
);
expect(responsive).toMatch(
  /@media \(pointer:\s*coarse\)[\s\S]*?\.project-kit-control-hit[\s\S]*?44px/s,
);
expect(css).not.toContain(".catalog-project-drag-handle");
expect(css).not.toContain(".catalog-project-drag-ghost");
expect(css).not.toContain(".project-selection-check");
```

Keep the existing dock-clearance, reduced-motion, and safe-area assertions.

- [ ] **Step 2: Run the visual contract to verify failure**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL until the new control/state selectors replace legacy drag and
selection-check CSS.

- [ ] **Step 3: Implement footer and card-state CSS**

Use an absolutely positioned sibling button with reserved footer space:

```css
.project-card-shell.has-kit-control .card-bottom {
  padding-left: 40px;
}

.project-kit-control-hit {
  position: absolute;
  z-index: 4;
  bottom: 4px;
  left: 4px;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
}

.project-kit-control {
  display: grid;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-kind-extension);
  border-radius: 5px;
  padding: 0;
  color: var(--color-page);
  background: var(--color-kind-extension);
  box-shadow: 0 2px 0 color-mix(in srgb, var(--color-page) 55%, transparent);
  place-items: center;
}

.project-kit-control[aria-pressed="true"] {
  box-shadow: inset 0 2px 3px
    color-mix(in srgb, var(--color-page) 65%, transparent);
  transform: translateY(1px);
}

.project-card-shell.in-draft .project-card {
  border-color: var(--color-kind-extension);
  box-shadow: 0 0 0 1px var(--color-kind-extension);
}
```

Keep the existing mint selected outline. Make focus visible independently from
both states. Preserve the subtle **In Kit** badge but align it so it cannot
overlap the footer control.

- [ ] **Step 4: Remove legacy CSS and update responsive/motion rules**

Delete catalog drag-handle, catalog drag-ghost, drag-active layout, and
selection-check rules. Retain builder drag selectors.

On coarse pointers, keep the 44-pixel hit wrapper while leaving the visible
orange square at 28 pixels. Confirm the shared dock retains:

```css
left: max(13px, env(safe-area-inset-left));
right: max(13px, env(safe-area-inset-right));
bottom: max(12px, env(safe-area-inset-bottom));
```

Under reduced motion, disable transforms on `.project-kit-control` without
removing border, glyph, pressed, or focus feedback.

- [ ] **Step 5: Run visual, palette, and type checks**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts tests/unit/project-card.test.tsx
npm.cmd run palette:audit
npm.cmd run typecheck
```

Expected: all commands PASS.

- [ ] **Step 6: Commit responsive styling**

```powershell
git add -- src/styles/catalog.css src/styles/responsive.css src/styles/motion.css tests/unit/visual-alignment-contract.test.ts tests/unit/project-card.test.tsx
git commit -m "style(kits): unify card selection states"
```

---

### Task 7: Cross-Viewport Workflow and Maintenance Proof

**Files:**
- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts`
- Modify: `tests/unit/kit-maintenance-docs.test.ts`
- Modify: `docs/superpowers/specs/2026-07-24-kits-design.md`
- Modify: `docs/superpowers/specs/2026-07-24-kits-mobile-design.md`
- Modify: `docs/superpowers/specs/2026-07-24-kits-motion-interaction-design.md`

**Interfaces:**
- Consumes: the complete unified interaction from Tasks 1–6.
- Produces: desktop/mobile behavioral parity proof and clear historical
  supersession notes in older specs.

- [ ] **Step 1: Replace long-press and catalog-drag E2E paths**

Remove the `longPress(...)` helper when no other test uses it. Replace desktop
and mobile selection setup with accessible Kit buttons:

```ts
async function selectProject(page: Page, projectName: string) {
  await page
    .getByRole("button", { name: `Add ${projectName} to Kit` })
    .click();
}
```

Add one shared workflow function used by desktop and phone tests:

```ts
async function verifyUnifiedSelectionFlow(page: Page) {
  await selectProject(page, "Fixture Frontend");
  await selectProject(page, "Fixture Tool 01");
  await selectProject(page, "Fixture Tool 02");

  const dock = page.getByRole("region", { name: "3 projects selected" });
  await expect(dock).toBeVisible();

  await page
    .getByRole("button", {
      name: "Remove Fixture Tool 02 from selection",
    })
    .click();
  await expect(
    page.getByRole("region", { name: "2 projects selected" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Add 2 projects to Kit" })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove Fixture Tool 01 from Kit" }),
  ).toBeVisible();
}
```

- [ ] **Step 2: Add immediate-removal synchronization cases**

Continue the shared workflow:

```ts
await page
  .getByRole("button", { name: "Remove Fixture Tool 01 from Kit" })
  .click();
await expect(
  page.getByRole("button", { name: "Add Fixture Tool 01 to Kit" }),
).toBeVisible();

await page
  .getByRole("button", { name: /Open Kit Builder, 1 project in draft/ })
  .click();
await page
  .getByRole("button", { name: "Remove Fixture Frontend from Kit" })
  .click();
await expect(
  page.getByRole("button", { name: "Add Fixture Frontend to Kit" }),
).toBeVisible();
```

At both viewport sizes, assert:

- first selection does not open the builder;
- the GitHub link remains unchanged and separately clickable;
- card selection survives search/filter changes;
- Cancel clears selection but not existing draft members;
- no catalog drag handle exists;
- no long-press-only state is required;
- the last card is not covered by the dock;
- mobile targets are at least 44 by 44 CSS pixels.

- [ ] **Step 3: Update visual baselines**

In `kits.visual.spec.ts`, capture:

- desktop available, selected, and In-Kit cards with the dock;
- desktop collapsed rail with the cumulative draft count;
- 390-pixel phone available, selected, and In-Kit cards with the dock;
- 320-pixel phone footer chip/license fit;
- expanded desktop and mobile builders with minus-box removal controls;
- reduced-motion card states.

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-visual -- --update-snapshots
```

Expected: snapshots update only for the intentional unified-control surfaces.
Inspect every changed PNG before accepting it.

- [ ] **Step 4: Update maintenance documentation assertions**

Add a supersession notice near the top of each older Kit interaction spec:

```markdown
> **Superseded interaction:** Catalog project selection, catalog drag-in, long
> press, and builder removal controls are superseded by
> `docs/superpowers/specs/2026-07-25-unified-kit-selection-design.md`.
```

Update `kit-maintenance-docs.test.ts` to require the new spec and assert:

```ts
const currentSpec = await readFile(
  "docs/superpowers/specs/2026-07-25-unified-kit-selection-design.md",
  "utf8",
);
expect(currentSpec).toContain("always visible");
expect(currentSpec).toContain("Add to Kit");
expect(currentSpec).toContain("desktop and mobile");
expect(currentSpec).toMatch(/supersedes/i);
for (const legacySpec of legacySpecs) {
  expect(legacySpec).toContain("Superseded interaction");
}
```

- [ ] **Step 5: Run focused and full verification**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder.test.tsx tests/unit/project-batch-selection.test.tsx tests/unit/project-card.test.tsx tests/unit/project-selection-dock.test.tsx tests/unit/visual-alignment-contract.test.ts tests/unit/kit-maintenance-docs.test.ts
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
npm.cmd run check
```

Expected:

- focused unit suites PASS;
- Kit test export builds;
- all Kit E2E tests PASS at desktop and phone viewports;
- all Kit visual tests PASS without new diffs;
- the complete repository check PASS, including format, lint, palette, catalog
  validation/build, typecheck, unit tests, production build, and static-export
  verification.

- [ ] **Step 6: Inspect the final diff for scope and legacy remnants**

Run:

```powershell
git diff --check
rg -n -e "PressSession|navigator\\.vibrate|catalog-project-drag|data-project-drag-handle|project-selection-check" src tests
git status --short
```

Expected: `git diff --check` is silent; `rg` returns no catalog-selection
legacy paths; status contains only intended implementation changes plus any
pre-existing user changes that were deliberately preserved.

- [ ] **Step 7: Commit integrated proof and documentation**

```powershell
git add -- tests/kits-e2e/kits.spec.ts tests/kits-e2e/kits.visual.spec.ts tests/unit/kit-maintenance-docs.test.ts docs/superpowers/specs/2026-07-24-kits-design.md docs/superpowers/specs/2026-07-24-kits-mobile-design.md docs/superpowers/specs/2026-07-24-kits-motion-interaction-design.md
git commit -m "test(kits): prove unified selection flow"
```

---

## Final Acceptance Checklist

- [ ] Every project card displays an orange `+ / −` control at desktop and
  mobile widths.
- [ ] Project-card links always open GitHub; Kit controls never activate them.
- [ ] The first `+` creates a collapsed transient draft without opening or
  highlighting the builder.
- [ ] Pending selection and Kit membership remain separate and visibly distinct.
- [ ] The same floating dock performs Cancel and atomic Add to Kit everywhere.
- [ ] In-Kit removal is immediate and synchronized between catalog and builder.
- [ ] Builder rows and the pinned Frontend use minus-box removal controls.
- [ ] Catalog long press, whole-card selection, drag-in, drag handles, drag
  ghost, and selection checks are absent.
- [ ] Desktop contained builder reordering still works.
- [ ] Frontend replacement, 50-project capacity, focus, live announcements,
  safe-area placement, and reduced motion pass.
- [ ] 320-, 390-, and 430-pixel phone checks and desktop checks pass.
- [ ] Full `npm.cmd run check` and Kit E2E/visual suites pass.
