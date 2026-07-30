# Manage-Project Searchable Combobox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Manage your project listing page's disconnected search and select controls with one live, accessible, catalog-backed project combobox.

**Architecture:** Add a Help-specific `ProjectPicker` component that owns display text, popup state, filtering, and keyboard navigation while exposing only the committed project ID to `ProjectOwnerBuilder`. Keep project loading and all downstream owner-request state in their existing modules; integration calls the existing `selectProject()` reset path.

**Tech Stack:** React 19, TypeScript 6, Next.js 16, Testing Library, Vitest, Playwright, and existing Help CSS variables.

## Global Constraints

- The picker consumes the existing `OwnerProjectOption[]`; do not add a second catalog data source.
- Filter client-side by card name, repository, or project ID.
- Only selection of a real option commits a project ID; typed text alone is not selection.
- Render results in a fixed-height scroll area without virtualization.
- Preserve valid `?project=<id>` initialization and all existing selection reset behavior.
- Support pointer selection plus Arrow Up, Arrow Down, Home, End, Enter, Escape, and Tab.
- Do not change registry, catalog-build, route, manifest, GitHub handoff, or owner-authority contracts.

---

### Task 1: Build the searchable project picker

**Files:**
- Create: `src/features/help/components/project-picker.tsx`
- Create: `tests/unit/project-picker.test.tsx`
- Modify: `src/styles/help.css`

**Interfaces:**
- Consumes: `OwnerProjectOption[]` from `@/lib/help/load-owner-project-options`.
- Produces:

```ts
interface ProjectPickerProps {
  projects: OwnerProjectOption[];
  value: string;
  onChange: (projectId: string) => void;
  invalid?: boolean;
}

export function ProjectPicker(props: ProjectPickerProps): React.JSX.Element;
```

- [ ] **Step 1: Write failing pointer and filtering tests**

Create `tests/unit/project-picker.test.tsx` with representative Alpha, Alpha
Preset, and Removed Card options. Assert that the component exposes one
combobox labeled `Project`, shows all options on focus, filters case
insensitively by each supported identity, commits the clicked option ID, and
shows `No matching projects` for an unmatched query:

```tsx
test("shows and filters live catalog-backed project results", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ProjectPicker projects={projects} value="" onChange={onChange} />);

  const picker = screen.getByRole("combobox", { name: "Project" });
  await user.click(picker);
  expect(screen.getAllByRole("option")).toHaveLength(3);

  await user.type(picker, "owner/removed");
  expect(screen.getByRole("option", { name: /Removed Card/iu })).toBeVisible();
  expect(screen.queryByRole("option", { name: /Alpha Preset/iu })).toBeNull();

  await user.clear(picker);
  await user.type(picker, "owner-alpha-preset");
  await user.click(screen.getByRole("option", { name: /Alpha Preset/iu }));
  expect(onChange).toHaveBeenLastCalledWith("owner-alpha-preset");
  expect(picker).toHaveValue("Alpha Preset");

  await user.clear(picker);
  await user.type(picker, "does not exist");
  expect(screen.getByText("No matching projects")).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-picker.test.tsx
```

Expected: FAIL because `project-picker.tsx` does not exist.

- [ ] **Step 3: Implement minimal filtering and pointer selection**

Create `project-picker.tsx` as a client component. Use:

```ts
function searchableText(project: OwnerProjectOption) {
  return `${project.name} ${project.repository ?? ""} ${project.id}`
    .toLocaleLowerCase();
}

function matchingProjects(projects: OwnerProjectOption[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized
    ? projects.filter((project) =>
        searchableText(project).includes(normalized),
      )
    : projects;
}
```

Render an `<input type="search" role="combobox">` with
`aria-autocomplete="list"`, `aria-expanded`, `aria-controls`,
`aria-activedescendant`, and `aria-invalid`. Render results under
`role="listbox"` and each result under `role="option"`. Each option's
accessible label includes project name, repository when present, and project
ID. On input change, call `onChange("")` if `value` is committed, retain the
typed query, open the popup, and reset the active index. On option selection,
call `onChange(project.id)`, replace the query with `project.name`, and close
the popup.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-picker.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Write failing keyboard and exact-selection tests**

Add tests proving Arrow/Home/End navigation updates the active option, Enter
commits it, Escape closes without committing, Tab closes, refocus reopens, and
arbitrary typed text never calls `onChange` with that text:

```tsx
test("commits only real projects through keyboard navigation", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<ProjectPicker projects={projects} value="" onChange={onChange} />);

  const picker = screen.getByRole("combobox", { name: "Project" });
  await user.click(picker);
  await user.keyboard("{End}{Enter}");
  expect(onChange).toHaveBeenLastCalledWith("removed-card");
  expect(picker).toHaveValue("Removed Card");

  await user.click(picker);
  await user.keyboard("{Escape}");
  expect(picker).toHaveAttribute("aria-expanded", "false");

  await user.clear(picker);
  await user.type(picker, "not-a-project");
  expect(onChange).not.toHaveBeenCalledWith("not-a-project");
});
```

- [ ] **Step 6: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-picker.test.tsx
```

Expected: FAIL because keyboard navigation and close behavior are incomplete.

- [ ] **Step 7: Implement keyboard, focus, and outside-pointer behavior**

Track `open` and `activeIndex`, derive stable option DOM IDs, and handle:

```ts
switch (event.key) {
  case "ArrowDown":
    // open and move toward the final visible option
    break;
  case "ArrowUp":
    // open and move toward the first visible option
    break;
  case "Home":
  case "End":
    // move to the first or final visible option
    break;
  case "Enter":
    // commit only the active visible option
    break;
  case "Escape":
  case "Tab":
    // close without inventing a selection
    break;
}
```

Use a root ref and document `pointerdown` listener to close only when the event
target is outside the component. When filtering changes, reset the active
index to the first result. Keep the committed name visible after selection and
sync a valid externally supplied `value` to its project name.

- [ ] **Step 8: Add bounded Help styling**

Add `.project-picker`, `.project-picker-listbox`,
`.project-picker-option`, `.project-picker-option-identity`, and active/selected
state rules to `src/styles/help.css`. Use existing control colors and focus
tokens. The listbox must use:

```css
max-height: min(320px, 50vh);
overflow-y: auto;
overscroll-behavior: contain;
```

Keep the popup in normal document flow so it cannot clip against the Help
container at desktop or mobile widths.

- [ ] **Step 9: Run component tests and formatting**

Run:

```powershell
npm.cmd test -- tests/unit/project-picker.test.tsx
npx.cmd prettier --check src/features/help/components/project-picker.tsx tests/unit/project-picker.test.tsx src/styles/help.css
```

Expected: all tests pass and formatting reports all files matched.

- [ ] **Step 10: Commit**

```powershell
git add -- src/features/help/components/project-picker.tsx tests/unit/project-picker.test.tsx src/styles/help.css
git commit -m "feat(help): add searchable project picker"
```

### Task 2: Integrate the picker with owner-request state

**Files:**
- Modify: `src/features/help/components/project-owner-builder.tsx`
- Modify: `tests/unit/project-owner-builder.test.tsx`

**Interfaces:**
- Consumes: `ProjectPicker` from Task 1.
- Produces: the existing `ProjectOwnerBuilder` API with one project-selection
  control and unchanged owner-request manifests.

- [ ] **Step 1: Write failing integration tests**

Replace the native-select test helper with:

```ts
async function selectProject(
  user: ReturnType<typeof userEvent.setup>,
  id = "owner-alpha",
) {
  const project = projects.find((candidate) => candidate.id === id)!;
  const picker = screen.getByRole("combobox", { name: "Project" });
  await user.clear(picker);
  await user.type(picker, project.id);
  await user.click(screen.getByRole("option", { name: new RegExp(project.name, "iu") }));
}
```

Add tests that assert the separate `Search listed projects` textbox and native
select no longer exist, a URL-prefilled project displays its name, invalid
typed text still produces `Select a listed project.`, and choosing a different
project resets an already chosen operation:

```tsx
test("uses one exact-selection project combobox", async () => {
  const user = userEvent.setup();
  renderBuilder();

  expect(screen.queryByLabelText("Search listed projects")).toBeNull();
  expect(screen.getByRole("combobox", { name: "Project" })).toBeVisible();

  await user.type(
    screen.getByRole("combobox", { name: "Project" }),
    "unknown card",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));
  expect(screen.getByText("Select a listed project.")).toBeVisible();
});
```

- [ ] **Step 2: Run the owner-builder tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-builder.test.tsx
```

Expected: FAIL because the page still renders a separate search input and
native project select.

- [ ] **Step 3: Replace the two controls with `ProjectPicker`**

In `project-owner-builder.tsx`:

- remove `search` state and `visibleProjects`;
- import `ProjectPicker`;
- replace `HelpTextField` plus `<select>` with:

```tsx
<ProjectPicker
  projects={projects}
  value={projectId}
  invalid={errors.includes("Select a listed project.")}
  onChange={selectProject}
/>
```

Keep `selectProject()` unchanged so selection continues to reset operation,
drafts, repository URL, explanation, errors, review state, manifest, and the
delist dialog.

- [ ] **Step 4: Run the focused integration tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-builder.test.tsx tests/unit/project-picker.test.tsx
```

Expected: both files pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/features/help/components/project-owner-builder.tsx tests/unit/project-owner-builder.test.tsx
git commit -m "refactor(help): unify project selection"
```

### Task 3: Prove live Help behavior and responsive containment

**Files:**
- Modify: `tests/e2e/help-center.spec.ts`
- Modify only if needed by a demonstrated issue:
  `src/features/help/components/project-picker.tsx`
  `src/styles/help.css`

**Interfaces:**
- Consumes: integrated Manage-project route from Task 2.
- Produces: browser-level regression proof for live filtering, keyboard
  selection, catalog-backed identity display, and mobile containment.

- [ ] **Step 1: Write the failing browser regression**

Add a test that opens `/help/manage-project/`, checks that focusing `Project`
shows many catalog-backed results, filters to `mentallyquill-directive`,
selects it with Arrow Down and Enter, and verifies owner operations appear.
Repeat at a 320-pixel viewport and assert no horizontal overflow:

```ts
test("searches and selects owner projects in one responsive combobox", async ({
  page,
}) => {
  await page.goto(sitePath("/help/manage-project/"));
  const picker = page.getByRole("combobox", { name: "Project" });

  await picker.fill("mentallyquill-directive");
  await expect(
    page.getByRole("option", { name: /Directive.*mentallyquill-directive/iu }),
  ).toBeVisible();
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(picker).toHaveValue("Directive");
  await expect(
    page.getByRole("radio", { name: "Edit card details" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  await picker.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 2: Run the focused browser test and verify its result**

Run:

```powershell
npm.cmd run test:e2e -- tests/e2e/help-center.spec.ts
```

Expected before any necessary repair: the new regression identifies any real
browser-level semantic or containment gap. If it passes on the first run, its
unit-level behavior was already developed through RED/GREEN in Tasks 1 and 2;
retain it as cross-layer proof.

- [ ] **Step 3: Apply only demonstrated browser-level repairs**

If Playwright exposes a gap, change only the picker or its CSS and state the
observed failure in the commit body. Do not modify catalog loading, owner
authority, or request manifests.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
npm.cmd test -- tests/unit/project-picker.test.tsx tests/unit/project-owner-builder.test.tsx
npm.cmd run test:e2e -- tests/e2e/help-center.spec.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run build
npm.cmd run verify:export
```

Expected: every command exits 0, all focused tests pass, and the production
static export completes.

- [ ] **Step 5: Inspect the final diff and commit the browser proof**

```powershell
git diff --check
git status --short
git add -- tests/e2e/help-center.spec.ts
git commit -m "test(help): cover live project picker"
```

If Step 3 required source changes, include those exact paths in `git add`.
