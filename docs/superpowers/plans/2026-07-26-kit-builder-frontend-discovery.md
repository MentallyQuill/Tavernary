# Kit Builder Frontend Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the empty Kit Builder Frontend slot into a clear shortcut that checks the existing Frontend project-kind filter and teaches users to add the Frontend from a catalog card.

**Architecture:** `CatalogPage` keeps sole ownership of `CatalogQuery` and exposes an idempotent `onRevealFrontends` callback through `KitBuilderPanel` and `KitBuilder` to `KitFrontendSlot`. The empty slot invokes that callback; the existing filter panel, active-query summary, URL serializer, and project selector all react to the same `query.kinds` update.

**Tech Stack:** TypeScript 6, React 19, Next.js 16 static export, Vitest, Testing Library, Playwright, CSS semantic tokens

## Global Constraints

- Empty-slot primary copy is exactly **Add a Frontend**.
- Empty-slot supporting copy is exactly **Choose one from the catalog cards**.
- The button accessible name is exactly **Show Frontend cards**.
- Activating the shortcut selects Projects mode and adds `frontend` to
  `query.kinds`; it never removes it.
- The shortcut must use shared catalog query state and must not introduce component-local or hidden filter state.
- Existing search, category, sort, density, and all other filters remain unchanged.
- Existing project-card link, `+` selection, selection-dock application, selected Frontend removal, draft persistence, validation, and submission behavior remain unchanged.
- Use existing semantic color and focus tokens; introduce no literal colors.
- Rebuild the static export before Playwright verification.

---

## File Structure

- `src/features/catalog/components/catalog-page.tsx`: owns the idempotent catalog-query mutation and passes it into the Kit Builder.
- `src/features/kits/components/kit-builder-panel.tsx`: transports the callback through the responsive builder shell.
- `src/features/kits/components/kit-builder.tsx`: transports the callback to the empty Frontend slot without changing draft state.
- `src/features/kits/components/kit-frontend-slot.tsx`: renders the empty slot as a semantic instructional button and preserves the populated state.
- `src/styles/catalog.css`: provides desktop/base empty-shortcut layout and interaction states.
- `src/styles/responsive.css`: preserves the shortcut geometry and reduced-motion behavior on touch/mobile layouts.
- `tests/unit/catalog-batch-flow.test.tsx`: proves shared filter state, URL visibility, idempotence, filter preservation, and manual removal.
- `tests/unit/kit-builder.test.tsx`: proves the empty and populated slot semantic contracts in isolation.
- `tests/unit/visual-alignment-contract.test.ts`: guards tokenized shortcut styling and focus treatment.
- `tests/kits-e2e/kits.spec.ts`: proves the complete rendered desktop and mobile discovery path against the static export.

---

### Task 1: Shared Frontend-filter shortcut behavior

**Files:**

- Modify: `tests/unit/kit-builder.test.tsx`
- Modify: `tests/unit/catalog-batch-flow.test.tsx`
- Modify: `src/features/kits/components/kit-frontend-slot.tsx`
- Modify: `src/features/kits/components/kit-builder.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`

**Interfaces:**

- Consumes: `CatalogPage`'s existing `setQuery(next)` and `CatalogQuery["kinds"]`.
- Produces: required prop `onRevealFrontends: () => void` on `KitBuilderPanel`, `KitBuilder`, and `KitFrontendSlot`.
- Produces: an empty-slot button with accessible name `Show Frontend cards`.

- [ ] **Step 1: Add a failing isolated empty-slot test**

Add a focused test to `tests/unit/kit-builder.test.tsx` using an empty `projectIds` draft:

```tsx
test("teaches and invokes Frontend catalog discovery from the empty slot", async () => {
  const user = userEvent.setup();
  const onRevealFrontends = vi.fn();

  render(
    <KitBuilder
      draft={{
        operation: "create",
        kitId: null,
        title: "",
        description: "",
        projectIds: [],
      }}
      projects={projects}
      originalProjectIds={[]}
      onUpdate={() => undefined}
      onSubmit={() => undefined}
      onRevealFrontends={onRevealFrontends}
    />,
  );

  const shortcut = screen.getByRole("button", {
    name: "Show Frontend cards",
  });
  expect(shortcut).toHaveTextContent("Add a Frontend");
  expect(shortcut).toHaveTextContent("Choose one from the catalog cards");

  await user.click(shortcut);
  expect(onRevealFrontends).toHaveBeenCalledOnce();
});
```

Also update every existing direct `KitBuilder` render in this file with
`onRevealFrontends={() => undefined}` so the new interface is explicit.

- [ ] **Step 2: Add failing shared-query tests**

Add two tests to `tests/unit/catalog-batch-flow.test.tsx`.

The default-query test must create a Kit, activate the shortcut, and prove the
normal checkbox, active-filter control, URL, and results all use the same state:

```tsx
test("reveals Frontend cards through the visible shared filter", () => {
  mockDesktopMatchMedia();
  render(<CatalogPage catalog={submissionCatalog} />);

  fireEvent.click(screen.getByRole("button", { name: "Open Kit Builder" }));
  fireEvent.click(screen.getByRole("button", { name: "Create new Kit" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Show Frontend cards" }),
  );

  expect(
    screen.getByRole("checkbox", { name: "Frontend" }),
  ).toBeChecked();
  expect(
    screen.getByRole("button", { name: "Remove Frontend" }),
  ).toBeVisible();
  expect(new URLSearchParams(window.location.search).getAll("kind")).toEqual([
    "frontend",
  ]);
  expect(
    screen.getByRole("link", { name: "Frontend" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Memory" }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("checkbox", { name: "Frontend" }));
  expect(
    screen.getByRole("checkbox", { name: "Frontend" }),
  ).not.toBeChecked();
  expect(new URLSearchParams(window.location.search).getAll("kind")).toEqual(
    [],
  );
});
```

Extract the repeated desktop `matchMedia` mock in this test file into
`mockDesktopMatchMedia()` rather than duplicating another inline mock.

The preservation/idempotence test starts at
`/?q=memory&kind=extension&license=missing`, activates the shortcut twice, and
asserts:

```tsx
expect(window.location.search).toContain("q=memory");
expect(window.location.search).toContain("license=missing");
expect(new URLSearchParams(window.location.search).getAll("kind")).toEqual([
  "extension",
  "frontend",
]);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/kit-builder.test.tsx tests/unit/catalog-batch-flow.test.tsx
```

Expected: FAIL because `KitBuilder` does not accept `onRevealFrontends`, the
empty slot is not a button, and the catalog query is unchanged.

- [ ] **Step 4: Implement the semantic empty-slot button**

Change `KitFrontendSlot` to require `onRevealFrontends: () => void`. Preserve
the populated branch exactly, and replace only the empty branch:

```tsx
<button
  type="button"
  className="kit-frontend-discovery"
  aria-label="Show Frontend cards"
  onClick={onRevealFrontends}
>
  <strong>Add a Frontend</strong>
  <span>Choose one from the catalog cards</span>
</button>
```

Add the same required callback prop to `KitBuilder` and pass it to
`KitFrontendSlot`.

- [ ] **Step 5: Plumb the callback through the builder shell**

Add the required prop to `KitBuilderPanel`:

```ts
onRevealFrontends: () => void;
```

Pass it to the Build-mode `KitBuilder`:

```tsx
<KitBuilder
  draft={state.draft}
  projects={projects}
  originalProjectIds={originalProjectIds}
  onRevealFrontends={onRevealFrontends}
  onUpdate={(patch) => onUpdateDraft?.(patch)}
  onSubmit={() => onSubmitDraft?.()}
/>
```

Update the `KitBuilderPanel` test wrapper in
`tests/unit/kit-builder-panel.test.tsx` to default
`onRevealFrontends={() => undefined}` so unrelated panel tests retain explicit
valid props.

- [ ] **Step 6: Implement the idempotent shared-query mutation**

In `CatalogPage`, define:

```ts
const revealFrontendCards = () =>
  setQuery((current) => {
    if (current.mode === "projects" && current.kinds.includes("frontend")) {
      return current;
    }
    return {
      ...current,
      mode: "projects",
      selectedKitId: "",
      kinds: current.kinds.includes("frontend")
        ? current.kinds
        : [...current.kinds, "frontend"],
    };
  });
```

Pass `onRevealFrontends={revealFrontendCards}` to `KitBuilderPanel`. Do not call
`toggleFilter`, because repeated shortcut activation must not remove the
Frontend filter.

- [ ] **Step 7: Run focused behavior tests and type checking**

Run:

```powershell
npm.cmd test -- tests/unit/kit-builder.test.tsx tests/unit/catalog-batch-flow.test.tsx tests/unit/kit-builder-panel.test.tsx
npm.cmd run typecheck
```

Expected: all targeted tests PASS and TypeScript exits `0`.

- [ ] **Step 8: Commit the behavior**

```powershell
git add -- src/features/catalog/components/catalog-page.tsx src/features/kits/components/kit-builder-panel.tsx src/features/kits/components/kit-builder.tsx src/features/kits/components/kit-frontend-slot.tsx tests/unit/catalog-batch-flow.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/kit-builder.test.tsx
git commit -m "feat(kits): reveal frontend catalog cards"
```

---

### Task 2: Actionable shortcut styling

**Files:**

- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`

**Interfaces:**

- Consumes: `.kit-frontend-discovery` markup from Task 1.
- Produces: tokenized two-line layout and visible rest, hover, active, and focus states without changing populated `.kit-frontend-slot` geometry.

- [ ] **Step 1: Add a failing visual contract test**

Add a test beside the existing Kit Builder style assertions in
`tests/unit/visual-alignment-contract.test.ts`:

```ts
test("styles the empty Frontend slot as a tokenized catalog shortcut", () => {
  const css = read("src/styles/catalog.css");

  expect(css).toMatch(
    /\.kit-frontend-discovery\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*cursor:\s*pointer/s,
  );
  expect(css).toMatch(
    /\.kit-frontend-discovery strong\s*\{[^}]*color:\s*var\(--color-frontend-text\)/s,
  );
  expect(css).toMatch(
    /\.kit-frontend-discovery:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus-ring\)/s,
  );
  expect(css).toMatch(
    /\.kit-frontend-discovery:hover\s*\{[^}]*background:\s*var\(--color-frontend-bg-hover\)/s,
  );
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because `.kit-frontend-discovery` does not yet have a visual
contract.

- [ ] **Step 3: Implement the base shortcut styling**

Replace the obsolete `.kit-frontend-slot > span` empty-state rule in
`src/styles/catalog.css` with:

```css
.kit-frontend-discovery {
  grid-column: 1 / -1;
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  color: var(--color-text-muted);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    color var(--kit-motion-state) var(--kit-motion-ease),
    background var(--kit-motion-state) var(--kit-motion-ease);
}

.kit-frontend-discovery strong {
  color: var(--color-frontend-text);
  font-size: 12px;
}

.kit-frontend-discovery span {
  font-size: 11px;
  line-height: 1.35;
}

.kit-frontend-discovery:hover {
  background: var(--color-frontend-bg-hover);
}

.kit-frontend-discovery:active {
  background: var(--color-frontend-bg);
}

.kit-frontend-discovery:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}
```

Retain the existing `.kit-frontend-slot` border and selected-state rules.
Include `.kit-frontend-discovery` in the existing reduced-motion selector in
`src/styles/responsive.css`.

- [ ] **Step 4: Run style, palette, and formatting checks**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
npm.cmd run palette:audit
npm.cmd run format:check
```

Expected: all commands exit `0`. If Prettier reports only touched files, run
`npm.cmd exec prettier -- --write` against those exact files, then rerun the
checks.

- [ ] **Step 5: Commit the styling**

```powershell
git add -- src/styles/catalog.css src/styles/responsive.css tests/unit/visual-alignment-contract.test.ts
git commit -m "style(kits): clarify frontend shortcut"
```

---

### Task 3: Rendered desktop and mobile workflow proof

**Files:**

- Modify: `tests/kits-e2e/kits.spec.ts`

**Interfaces:**

- Consumes: the shared `Show Frontend cards` shortcut, existing Frontend
  checkbox, active-filter control, project-card `+`, selection dock, and
  responsive Kit Builder.
- Produces: regression proof against Tavernary's generated Kit fixture export.

- [ ] **Step 1: Add a rendered discovery workflow test**

Add a helper that runs at desktop and phone widths:

```ts
async function verifyFrontendDiscovery(
  page: import("@playwright/test").Page,
  phone: boolean,
) {
  await page.goto(sitePath());
  if (phone) {
    await page.getByRole("button", { name: "Browse categories" }).click();
    await page.getByRole("button", { name: "Kits", exact: true }).click();
    await page.getByRole("button", { name: "Create Kit" }).click();
  } else {
    await page.getByRole("button", { name: "Open Kit Builder" }).click();
    await page.getByRole("button", { name: "Create new Kit" }).click();
  }

  const shortcut = page.getByRole("button", {
    name: "Show Frontend cards",
  });
  await expect(shortcut).toContainText("Add a Frontend");
  await expect(shortcut).toContainText("Choose one from the catalog cards");
  await shortcut.click();
  await expect(page).toHaveURL(/kind=frontend/);

  if (phone) {
    await page.getByRole("button", { name: "Close Kit Builder" }).click();
    await page.getByRole("button", { name: "Open filters" }).click();
    const filters = page.getByRole("dialog", { name: "Filters" });
    await expect(
      filters.getByRole("checkbox", { name: "Frontend" }),
    ).toBeChecked();
    await filters.getByRole("button", { name: "Close filters" }).click();
  } else {
    await expect(
      page.getByRole("checkbox", { name: "Frontend" }),
    ).toBeChecked();
  }

  await expect(
    page.getByRole("button", { name: "Remove Frontend" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Fixture Frontend to Kit" }),
  ).toBeVisible();
}
```

Invoke it from two tests with `{ width: 1440, height: 900 }` and
`{ width: 390, height: 844 }`. Extend the desktop path to:

1. select **Fixture Frontend** through its card `+`;
2. apply **Add 1 project to Kit**;
3. verify the populated slot exposes **Remove Fixture Frontend from Kit**;
4. remove the active filter through **Remove Frontend**;
5. verify the Frontend checkbox becomes unchecked and `kind=frontend` leaves
   the URL.

For the phone case, enter Kits mode through **Browse categories**, activate
**Create Kit**, then use the shortcut. Assert that the URL no longer contains
`mode=kits` and the project catalog is present before closing the builder and
opening the project filter sheet.

Assert the shortcut's bounding box stays within `.kit-frontend-slot`, and use
the existing `expectMobileTarget(shortcut)` helper on phone.

- [ ] **Step 2: Build the fresh Kit static export**

Run:

```powershell
npm.cmd run build:test-kits
```

Expected: exit `0` and regenerate the Kit fixture export used by
`playwright.kits.config.ts`.

- [ ] **Step 3: Run the focused rendered test and fix only observed failures**

Run:

```powershell
npm.cmd run test:kits-e2e -- --grep "Frontend discovery"
```

Expected: both desktop and mobile cases PASS. If the exact generated filter
sheet close label differs, inspect the rendered accessible name and align the
test with the existing production label; do not change unrelated filter copy.

- [ ] **Step 4: Run the complete focused verification set**

Run:

```powershell
npm.cmd test -- tests/unit/kit-builder.test.tsx tests/unit/catalog-batch-flow.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/visual-alignment-contract.test.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run palette:audit
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
git diff --check
git status --short
```

Expected: all commands exit `0`. `git status --short` shows only the intended
E2E test change before the final commit. If a broader pre-existing failure is
encountered, record the exact command and failure separately; do not modify
unrelated files.

- [ ] **Step 5: Commit the rendered regression proof**

```powershell
git add -- tests/kits-e2e/kits.spec.ts
git commit -m "test(kits): cover frontend discovery"
```

---

## Completion Criteria

- The empty Frontend slot clearly teaches the catalog-card workflow.
- Activating it visibly checks the existing Frontend project-kind filter.
- The URL and active-filter summary expose the same filter state.
- Existing filters are preserved and repeated activation is idempotent.
- Users can manually uncheck or remove the Frontend filter.
- Desktop and mobile rendered paths reach the existing Frontend card `+`.
- Populated Frontend slot behavior is unchanged.
- Focused unit, type, lint, palette, static-export, and Kit Playwright checks pass.
