# Progressive Tag Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized, independently scrolling tag picker with usage-ranked progressive Goal and Trait facets, and give every chip-style filter a compact beveled selected and keyboard-focus treatment.

**Architecture:** Introduce one controlled `FilterChoiceChip` primitive for checkbox/radio semantics and visual state. Refactor `TagBrowser` to own usage ranking, search, independent facet disclosure, and a removable selected-tag rail while preserving the existing controlled selection and catalog-query flow.

**Tech Stack:** Next.js, React, TypeScript, CSS, Vitest, Testing Library, Playwright.

## Global Constraints

- Use a four-pixel border radius and a 26-pixel visual height for every chip-style filter choice.
- Selected chips use a subtle teal fill, a restrained one-pixel accent border, and a checkmark.
- Pointer selection must not produce the keyboard-focus halo.
- Keyboard focus must use `:focus-visible` and render inside the chip boundary so clipping is impossible.
- Rank each Goal and Trait preview by descending project count, then alphabetically by public label.
- Treat a missing project count as zero.
- Keep Goal and Trait expansion state independent.
- Render `Show {hiddenCount} more` from collection and preview lengths; never encode production vocabulary totals in UI copy or tests.
- Keep selected tags visible in a removable rail during collapse and nonmatching search.
- Search labels, aliases, and descriptions; search must not clear selection or expansion state.
- Preserve within-facet OR and cross-facet AND catalog matching.
- Preserve existing tag IDs, URL serialization, schema, vocabulary, card chips, and list-style filters.
- Apply the progressive tag-browser behavior to catalog, project-submission, and owner-edit consumers.
- Add no runtime dependency.
- Use Windows-compatible `npm.cmd` verification commands.

---

## File Structure

### Create

- `src/features/catalog/components/filter-choice-chip.tsx`
  - Controlled checkbox/radio chip primitive.
  - Owns semantic input markup, label, count, selected/disabled classes, and styling hooks.
- `tests/unit/filter-choice-chip.test.tsx`
  - Verifies input semantics, callbacks, counts, selected state, and disabled state.

### Modify

- `src/features/catalog/components/filter-controls.tsx`
  - Replaces duplicated metadata-chip input markup with `FilterChoiceChip`.
  - Retains the existing `FilterGroup` list/chip disclosure behavior.
- `src/features/catalog/components/tag-browser.tsx`
  - Adds shared preview configuration, usage ranking, independent facet expansion, selected rail, search behavior, and `FilterChoiceChip` options.
- `src/features/catalog/components/filter-panel.tsx`
  - Passes the shared tag preview configuration to the catalog picker.
- `src/features/submissions/components/project-submission-builder.tsx`
  - Passes the same preview configuration to the manual submission picker.
- `src/features/help/components/owner-card-fields.tsx`
  - Passes the same preview configuration to each owner-edit card picker.
- `src/styles/catalog.css`
  - Replaces fully rounded metadata/tag rules with the shared beveled filter-chip contract.
  - Removes the bounded tag-results scrollbar.
  - Adds progressive facets, selected rail, disclosure, and inset keyboard focus.
- `docs/reference/mockups/catalog-wall-responsive-v7.html`
  - Updates the metadata-chip reference dimensions and bevel used by alignment tests.
- `tests/unit/tag-browser.test.tsx`
  - Replaces bounded-browser assertions with ranking, disclosure, rail, search, and limit coverage.
- `tests/unit/visual-alignment-contract.test.ts`
  - Locks the shared chip dimensions and focus selector while rejecting the obsolete tag/browser rules.
- `tests/helpers/generated-catalog.ts`
  - Exposes fixture-derived, usage-ranked Goal and Trait option data for browser tests.
- `tests/e2e/catalog.spec.ts`
  - Covers dynamic disclosure, independent expansion, selected rail, search, URL flow, pointer selection, and keyboard focus.
- `tests/e2e/mobile.spec.ts`
  - Replaces nested-scroll expectations with progressive mobile behavior and overflow checks.
- `tests/e2e/project-submission.spec.ts`
  - Exercises progressive disclosure before selecting six manual tags at narrow width.
- `tests/visual/reference-alignment.spec.ts`
  - Compares production's shared filter chip against the updated reference profile.

---

### Task 1: Shared Beveled Filter Choice

**Files:**

- Create: `src/features/catalog/components/filter-choice-chip.tsx`
- Create: `tests/unit/filter-choice-chip.test.tsx`
- Modify: `src/features/catalog/components/filter-controls.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `docs/reference/mockups/catalog-wall-responsive-v7.html`
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/visual/reference-alignment.spec.ts`
- Test: `tests/unit/filter-choice-chip.test.tsx`
- Test: `tests/unit/visual-alignment-contract.test.ts`
- Test: `tests/visual/reference-alignment.spec.ts`

**Interfaces:**

- Consumes: existing `FilterGroup` option labels, counts, checked state, selection mode, and `onToggle`.
- Produces:

```ts
export interface FilterChoiceChipProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  type?: "checkbox" | "radio";
  name?: string;
  count?: number;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function FilterChoiceChip(props: FilterChoiceChipProps): JSX.Element;
```

- Produces shared styling hooks:
  - `.filter-choice`
  - `.filter-choice.selected`
  - `.filter-choice.disabled`
  - `.filter-choice-chip`
  - `.filter-choice-check`
  - `.filter-choice-count`

- [ ] **Step 1: Write the failing component tests**

Create `tests/unit/filter-choice-chip.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { FilterChoiceChip } from "@/features/catalog/components/filter-choice-chip";

afterEach(cleanup);

test("renders controlled checkbox semantics and announces the count", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <FilterChoiceChip
      label="Claude"
      count={6}
      checked={false}
      onChange={onChange}
    />,
  );

  const input = screen.getByRole("checkbox", { name: "Claude" });
  expect(input).not.toBeChecked();
  expect(screen.getByText("6")).toHaveAccessibleName("6 projects");
  await user.click(input);
  expect(onChange).toHaveBeenCalledTimes(1);
});

test("exposes selected, disabled, radio, and title state", () => {
  const { container } = render(
    <FilterChoiceChip
      type="radio"
      name="Model family"
      label="GLM"
      checked
      disabled
      title="GLM-compatible projects"
      onChange={() => undefined}
    />,
  );

  expect(screen.getByRole("radio", { name: "GLM" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "GLM" })).toBeDisabled();
  expect(container.querySelector(".filter-choice")).toHaveClass(
    "selected",
    "disabled",
  );
  expect(container.querySelector(".filter-choice")).toHaveAttribute(
    "title",
    "GLM-compatible projects",
  );
});
```

- [ ] **Step 2: Replace the old CSS contract assertions with failing shared-chip assertions**

In `tests/unit/visual-alignment-contract.test.ts`, replace the old
`25px`/`999px` and clipped-overflow expectations with:

```ts
expect(controls).toContain("FilterChoiceChip");
expect(css).toMatch(
  /\.filter-choice-chip\s*\{[^}]*min-height:\s*26px[^}]*border-radius:\s*4px/s,
);
expect(css).toMatch(
  /\.filter-choice:has\(input:focus-visible\) \.filter-choice-chip\s*\{[^}]*inset[^}]*var\(--color-focus-ring\)/s,
);
expect(css).not.toMatch(
  /\.metadata-option:focus-within \.metadata-filter-chip/,
);
expect(css).toMatch(
  /\.filter-choice\.selected \.filter-choice-chip\s*\{[^}]*border:\s*1px solid var\(--color-accent-teal-border\)[^}]*background:\s*var\(--color-accent-teal-bg\)/s,
);
```

Keep the collapsed metadata cloud but update its row calculation to the new
chip height:

```ts
expect(css).toMatch(
  /\.metadata-options\.collapsed\s*\{[^}]*max-height:\s*calc\(26px \* 4 \+ 6px \* 3\)[^}]*overflow:\s*hidden/s,
);
```

- [ ] **Step 3: Run the focused tests and verify the red state**

Run:

```powershell
npm.cmd test -- tests/unit/filter-choice-chip.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because `filter-choice-chip.tsx` does not exist and the CSS
still uses the old metadata/tag classes, `25px`, `999px`, and
`:focus-within`.

- [ ] **Step 4: Create the controlled filter-choice primitive**

Create `src/features/catalog/components/filter-choice-chip.tsx`:

```tsx
"use client";

export interface FilterChoiceChipProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  type?: "checkbox" | "radio";
  name?: string;
  count?: number;
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function FilterChoiceChip({
  label,
  checked,
  onChange,
  type = "checkbox",
  name,
  count,
  disabled = false,
  title,
  className,
}: FilterChoiceChipProps) {
  const classes = [
    "filter-choice",
    className,
    checked ? "selected" : "",
    disabled ? "disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={classes} title={title}>
      <span className="filter-choice-chip">
        <input
          type={type}
          name={name}
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        <span className="filter-choice-check" aria-hidden="true">
          {"\u2713"}
        </span>
        <span>{label}</span>
        {count !== undefined ? (
          <b
            className="filter-choice-count"
            aria-label={`${count} ${count === 1 ? "project" : "projects"}`}
          >
            {count}
          </b>
        ) : null}
      </span>
    </label>
  );
}
```

- [ ] **Step 5: Refactor chip-presented `FilterGroup` options**

In `src/features/catalog/components/filter-controls.tsx`:

1. Import `FilterChoiceChip`.
2. Remove the duplicated `<label><span><input>...` metadata markup.
3. Render:

```tsx
<FilterChoiceChip
  className="metadata-option"
  type={selectionMode === "single" ? "radio" : "checkbox"}
  name={selectionMode === "single" ? title : undefined}
  label={option.label}
  count={option.count}
  checked={isSelected}
  onChange={() => onToggle(option.id)}
/>
```

Keep `FilterGroup`'s current search, selected-extra pinning, resize
measurement, four-row collapse, and disclosure behavior unchanged.

- [ ] **Step 6: Replace metadata/tag chip styling with the shared visual contract**

In `src/styles/catalog.css`, introduce:

```css
.filter-choice {
  position: relative;
  display: inline-flex;
  min-height: 0;
  color: var(--color-control-text);
  cursor: pointer;
}

.filter-choice-chip {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--color-control-border);
  border-radius: 4px;
  padding: 4px 6px;
  color: var(--color-control-text);
  background: var(--color-control-bg);
  cursor: pointer;
  font-size: 9px;
  line-height: 1;
}

.filter-choice-chip input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.filter-choice-check {
  display: none;
  color: var(--color-text-primary);
  font-weight: 900;
}

.filter-choice-count {
  color: var(--color-text-muted);
  font-size: 9px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.filter-choice:hover .filter-choice-chip {
  border-color: var(--color-control-border-hover);
  background: var(--color-control-bg-hover);
}

.filter-choice.selected .filter-choice-chip {
  border: 1px solid var(--color-accent-teal-border);
  color: var(--color-accent-teal-text);
  background: var(--color-accent-teal-bg);
}

.filter-choice.selected .filter-choice-check {
  display: inline;
}

.filter-choice:has(input:focus-visible) .filter-choice-chip {
  box-shadow: inset 0 0 0 2px var(--color-focus-ring);
}

.filter-choice.disabled {
  cursor: not-allowed;
  color: var(--color-text-disabled);
}

.filter-choice.disabled .filter-choice-chip {
  border-color: var(--color-border-subtle);
  color: var(--color-text-disabled);
  background: var(--color-bg-disabled);
  cursor: not-allowed;
}
```

Update `.metadata-options.collapsed` to use `26px` in its four-row
calculation. Retain `.metadata-option` only for its ordering behavior and
delete obsolete `.metadata-filter-chip`, `.metadata-check`,
`.metadata-count`, and `:focus-within` rules.

- [ ] **Step 7: Update the visual reference**

In `docs/reference/mockups/catalog-wall-responsive-v7.html`, change only the
reference metadata-chip profile used by alignment tests:

```css
.metadata-filter-chip {
  min-height: 26px;
  border-radius: 4px;
  padding: 4px 6px;
}
```

In `tests/visual/reference-alignment.spec.ts`, change the production selector
from `.metadata-filter-chip` to `.filter-choice-chip`. Keep the reference
selector `.metadata-filter-chip`.

- [ ] **Step 8: Run focused unit and visual verification**

Run:

```powershell
npm.cmd test -- tests/unit/filter-choice-chip.test.tsx tests/unit/visual-alignment-contract.test.ts
npm.cmd run test:visual -- --grep "production preserves the approved mockup layout profile"
```

Expected: both unit files pass, and the reference-alignment visual test
passes with a 26-pixel, four-pixel-radius production chip.

- [ ] **Step 9: Commit the shared chip**

```powershell
git add -- src/features/catalog/components/filter-choice-chip.tsx tests/unit/filter-choice-chip.test.tsx src/features/catalog/components/filter-controls.tsx src/styles/catalog.css docs/reference/mockups/catalog-wall-responsive-v7.html tests/unit/visual-alignment-contract.test.ts tests/visual/reference-alignment.spec.ts
git commit -m "refactor(filters): share choice chips"
```

---

### Task 2: Progressive Goal and Trait Facets

**Files:**

- Modify: `src/features/catalog/components/tag-browser.tsx`
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `src/features/help/components/owner-card-fields.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/unit/tag-browser.test.tsx`
- Test: `tests/unit/tag-browser.test.tsx`
- Test: `tests/unit/project-submission-builder.test.tsx`
- Test: `tests/unit/project-owner-builder.test.tsx`

**Interfaces:**

- Consumes: `FilterChoiceChip` from Task 1.
- Produces:

```ts
export const TAG_FACET_PREVIEW_LIMIT = 8;

export interface TagBrowserProps {
  tags: readonly PublicTagDefinition[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  previewLimit: number;
  maxSelections?: number;
  counts?: Readonly<Record<string, number>>;
  searchLabel: string;
  limitLabel?: string;
}
```

- `previewLimit` is a UX configuration, not a vocabulary total. All
  production consumers pass `TAG_FACET_PREVIEW_LIMIT`.
- Selected rail buttons use the accessible name `Remove {publicLabel}`.
- Facet disclosure buttons use `Show {hiddenCount} more` and `Show fewer`.

- [ ] **Step 1: Replace bounded-browser tests with failing progressive behavior tests**

In `tests/unit/tag-browser.test.tsx`, update `Harness` to accept custom count
fixtures and pass `previewLimit={2}`:

```tsx
function Harness({
  tags = hundredTags,
  initialSelected = [],
  maxSelections = 6,
  counts = Object.fromEntries(tags.map((tag, index) => [tag.id, index])),
}: {
  tags?: PublicTagDefinition[];
  initialSelected?: string[];
  maxSelections?: number;
  counts?: Readonly<Record<string, number>>;
}) {
  const [selected, setSelected] = useState(initialSelected);
  return (
    <TagBrowser
      tags={tags}
      selected={selected}
      onToggle={(id) =>
        setSelected((current) =>
          current.includes(id)
            ? current.filter((value) => value !== id)
            : [...current, id],
        )
      }
      previewLimit={2}
      maxSelections={maxSelections}
      counts={counts}
      searchLabel="Search goals and traits"
      limitLabel="6 tags maximum"
    />
  );
}
```

Then replace the bounded-region test with:

```tsx
test("ranks facet previews and derives disclosure counts", () => {
  render(
    <Harness
      tags={coreTags}
      counts={{
        "maintain-long-term-memory": 2,
        "generate-images": 9,
        "local-first": 4,
        "goal-1": 9,
      }}
    />,
  );

  const goals = screen.getByRole("group", { name: "Goals" });
  expect(
    within(goals)
      .getAllByRole("checkbox")
      .map((input) => input.getAttribute("aria-label")),
  ).toEqual(["Generate images", "Goal 1"]);
  expect(
    within(goals).getByRole("button", { name: "Show 5 more" }),
  ).toHaveAttribute("aria-expanded", "false");
});
```

Add independent expansion:

```tsx
test("expands Goals and Traits independently", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  const goals = screen.getByRole("group", { name: "Goals" });
  const traits = screen.getByRole("group", { name: "Traits" });
  const initialTraitCount = within(traits).getAllByRole("checkbox").length;

  await user.click(
    within(goals).getByRole("button", { name: /Show \d+ more/u }),
  );
  expect(within(goals).getByRole("button", { name: "Show fewer" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(within(traits).getAllByRole("checkbox")).toHaveLength(
    initialTraitCount,
  );
});
```

Add selected rail and limit behavior:

```tsx
test("keeps selected tags removable outside the collapsed preview", async () => {
  const user = userEvent.setup();
  render(
    <Harness
      tags={coreTags}
      initialSelected={["maintain-long-term-memory"]}
      counts={{ "maintain-long-term-memory": 0, "generate-images": 10 }}
    />,
  );

  expect(
    screen.getByRole("button", {
      name: "Remove Maintain long-term memory",
    }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", {
      name: "Remove Maintain long-term memory",
    }),
  );
  expect(
    screen.queryByRole("button", {
      name: "Remove Maintain long-term memory",
    }),
  ).toBeNull();
});
```

Add search-state restoration:

```tsx
test("searches all metadata without clearing selections or expansion", async () => {
  const user = userEvent.setup();
  render(
    <Harness
      tags={coreTags}
      initialSelected={["local-first"]}
    />,
  );

  const goals = screen.getByRole("group", { name: "Goals" });
  await user.click(
    within(goals).getByRole("button", { name: /Show \d+ more/u }),
  );
  await user.type(
    screen.getByRole("searchbox", { name: "Search goals and traits" }),
    "persistent context",
  );

  expect(screen.getByLabelText("Maintain long-term memory")).toBeVisible();
  expect(screen.queryByLabelText("Generate images")).toBeNull();
  expect(screen.getByRole("button", { name: "Remove Local-first" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Show/u })).toBeNull();

  await user.clear(
    screen.getByRole("searchbox", { name: "Search goals and traits" }),
  );
  expect(
    within(screen.getByRole("group", { name: "Goals" })).getByRole("button", {
      name: "Show fewer",
    }),
  ).toBeVisible();
});
```

Keep the existing search alias/description, six-selection limit, keyboard
space, and count-announcement coverage. Update those assertions to use the
selected rail instead of assuming selected options reorder into the first
facet position.

- [ ] **Step 2: Run the tag-browser tests and verify the red state**

Run:

```powershell
npm.cmd test -- tests/unit/tag-browser.test.tsx
```

Expected: FAIL because `TagBrowser` has no `previewLimit`, selected rail, or
facet disclosure controls and still renders `.tag-results-bounded`.

- [ ] **Step 3: Implement usage ranking and progressive facet derivation**

In `src/features/catalog/components/tag-browser.tsx`, import
`FilterChoiceChip`, export the shared preview value, and add:

```tsx
export const TAG_FACET_PREVIEW_LIMIT = 8;

function rankTags(
  tags: readonly PublicTagDefinition[],
  counts: Readonly<Record<string, number>>,
) {
  return [...tags].sort(
    (left, right) =>
      (counts[right.id] ?? 0) - (counts[left.id] ?? 0) ||
      left.label.localeCompare(right.label),
  );
}
```

Add controlled props and expansion state:

```tsx
const [query, setQuery] = useState("");
const [expandedFacets, setExpandedFacets] = useState({
  goal: false,
  trait: false,
});
const searching = query.trim().length > 0;
const matchedIds = new Set(searchTags(tags, query).map(({ id }) => id));
const selectedSet = new Set(selected);
const selectedTags = selected
  .map((id) => tags.find((tag) => tag.id === id))
  .filter((tag): tag is PublicTagDefinition => tag !== undefined);
```

For each facet, derive:

```tsx
const facetTags = rankTags(
  tags.filter(
    (tag) =>
      tag.facet === facet && (!searching || matchedIds.has(tag.id)),
  ),
  counts,
);
const expanded = expandedFacets[facet];
const visibleFacetTags =
  searching || expanded ? facetTags : facetTags.slice(0, previewLimit);
const hiddenCount = facetTags.length - visibleFacetTags.length;
```

Do not include nonmatching selected tags in search results. The selected rail
is their persistent representation.

- [ ] **Step 4: Render selected rail, shared options, and dynamic disclosure**

Immediately after the status row, render:

```tsx
{selectedTags.length > 0 ? (
  <div className="tag-browser-selected" aria-label="Selected goals and traits">
    {selectedTags.map((tag) => (
      <button
        className="filter-selected-chip"
        type="button"
        aria-label={`Remove ${tag.label}`}
        onClick={() => onToggle(tag.id)}
        key={tag.id}
      >
        <span aria-hidden="true">{"\u2713"}</span>
        <span>{tag.label}</span>
        <span aria-hidden="true">{"\u00d7"}</span>
      </button>
    ))}
  </div>
) : null}
```

Replace each tag option with:

```tsx
<FilterChoiceChip
  className="tag-browser-option"
  label={tag.label}
  count={counts[tag.id]}
  checked={isSelected}
  disabled={isDisabled}
  title={tag.description}
  onChange={() => onToggle(tag.id)}
/>
```

Render disclosure inside each nonempty fieldset:

```tsx
{!searching && (hiddenCount > 0 || expanded) ? (
  <button
    className="more-frontends tag-browser-disclosure"
    type="button"
    aria-expanded={expanded}
    onClick={() =>
      setExpandedFacets((current) => ({
        ...current,
        [facet]: !current[facet],
      }))
    }
  >
    {expanded ? "Show fewer" : `Show ${hiddenCount} more`}
  </button>
) : null}
```

Omit a facet when `facetTags.length === 0`. Render
`No matching goals or traits.` when both searched facets are empty. Remove the
`tag-results-bounded` wrapper and keep the facets in a plain
`.tag-browser-facets` container.

- [ ] **Step 5: Pass the shared preview configuration from every consumer**

Import `TAG_FACET_PREVIEW_LIMIT` alongside `TagBrowser` and pass:

```tsx
previewLimit={TAG_FACET_PREVIEW_LIMIT}
```

in:

- `src/features/catalog/components/filter-panel.tsx`
- `src/features/submissions/components/project-submission-builder.tsx`
- `src/features/help/components/owner-card-fields.tsx`

This keeps the number centrally configured while leaving every displayed
hidden count fixture- and vocabulary-derived.

- [ ] **Step 6: Replace bounded tag styling with progressive layout**

In `src/styles/catalog.css`, remove:

- `.tag-results-bounded`
- the tag-specific 44-pixel minimum height
- the tag-specific `999px` radius
- duplicated tag input, hover, focus, selected, disabled, check, and count
  rules now owned by `FilterChoiceChip`

Add:

```css
.tag-browser-facets {
  display: grid;
  gap: 12px;
}

.tag-browser-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-selected-chip {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--color-accent-teal-border);
  border-radius: 4px;
  padding: 4px 6px;
  color: var(--color-accent-teal-text);
  background: var(--color-accent-teal-bg);
  cursor: pointer;
  font-size: 9px;
  line-height: 1;
}

.filter-selected-chip:focus-visible {
  outline: 0;
  box-shadow: inset 0 0 0 2px var(--color-focus-ring);
}

.tag-browser-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-browser-disclosure {
  margin-top: 8px;
}
```

Retain the existing fieldset, legend, status, and empty-state typography.

- [ ] **Step 7: Run affected unit tests**

Run:

```powershell
npm.cmd test -- tests/unit/tag-browser.test.tsx tests/unit/project-submission-builder.test.tsx tests/unit/project-owner-builder.test.tsx
```

Expected: all tests pass. The existing six-tag allowance remains independent
for every owner card, and both form consumers render progressive facets
without changing their persisted values.

- [ ] **Step 8: Commit progressive facet behavior**

```powershell
git add -- src/features/catalog/components/tag-browser.tsx src/features/catalog/components/filter-panel.tsx src/features/submissions/components/project-submission-builder.tsx src/features/help/components/owner-card-fields.tsx src/styles/catalog.css tests/unit/tag-browser.test.tsx
git commit -m "feat(filters): add progressive tag facets"
```

---

### Task 3: Cross-Surface Browser Regressions

**Files:**

- Modify: `tests/helpers/generated-catalog.ts`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/e2e/project-submission.spec.ts`
- Test: `tests/e2e/catalog.spec.ts`
- Test: `tests/e2e/mobile.spec.ts`
- Test: `tests/e2e/project-submission.spec.ts`

**Interfaces:**

- Consumes: `TAG_FACET_PREVIEW_LIMIT`, `FilterChoiceChip`, dynamic
  disclosure, selected rail, and shared count inputs from Tasks 1 and 2.
- Produces:

```ts
export const tagOptionsByFacet: Record<
  "goal" | "trait",
  Array<{
    id: string;
    label: string;
    count: number;
  }>
>;
```

- Browser expectations calculate hidden totals from actual vocabulary and
  rendered preview lengths. They do not import or duplicate production
  inventory totals.

- [ ] **Step 1: Add fixture-derived facet ranking**

In `tests/helpers/generated-catalog.ts`, add:

```ts
function tagProjectCount(id: string) {
  return generatedCatalog.projects.filter(({ tags }) =>
    tags.some((tag) => tag.id === id),
  ).length;
}

export const tagOptionsByFacet = Object.fromEntries(
  (["goal", "trait"] as const).map((facet) => [
    facet,
    generatedCatalog.tagVocabulary
      .filter((tag) => tag.facet === facet)
      .map(({ id, label }) => ({
        id,
        label,
        count: tagProjectCount(id),
      }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.label.localeCompare(right.label),
      ),
  ]),
) as Record<
  "goal" | "trait",
  Array<{ id: string; label: string; count: number }>
>;
```

- [ ] **Step 2: Replace the catalog bounded-scroll test**

In `tests/e2e/catalog.spec.ts`, replace
`bounds searchable goals and traits and keeps selections visible` with
`ranks and progressively discloses goals and traits`.

For each facet:

```ts
const group = browser.getByRole("group", {
  name: facet === "goal" ? "Goals" : "Traits",
});
const visibleLabels = await group
  .getByRole("checkbox")
  .evaluateAll((inputs) =>
    inputs.map((input) => input.getAttribute("aria-label")),
  );
expect(visibleLabels).toEqual(
  tagOptionsByFacet[facet]
    .slice(0, visibleLabels.length)
    .map(({ label }) => label),
);
const hiddenCount = tagOptionsByFacet[facet].length - visibleLabels.length;
if (hiddenCount > 0) {
  await expect(
    group.getByRole("button", {
      name: `Show ${hiddenCount} more`,
    }),
  ).toBeVisible();
}
```

Then:

1. Expand Goals and assert Traits retains its initial checkbox count.
2. Assert Goals renders every fixture-derived Goal and shows `Show fewer`.
3. Select `tagSearchFixture`.
4. Search for a deliberate nonmatch.
5. Assert `Remove {tagSearchFixture.label}` remains visible while the
   checkbox result is absent.
6. Remove it through the rail and assert the empty state appears.
7. Assert `.tag-results-bounded` does not exist.
8. Assert `.tag-browser-facets` has computed `overflow-y: visible`.

- [ ] **Step 3: Add isolated pointer-versus-keyboard focus coverage**

Add a separate catalog E2E test named
`uses subtle selection and contained keyboard focus for filter chips`. Navigate
to System Presets, locate the Model family group, and run:

```ts
const glm = presetModelGroup.getByLabel("GLM", { exact: true });
const glmChoice = glm.locator("xpath=ancestor::label");
await glmChoice.click();
const glmChip = glmChoice.locator(".filter-choice-chip");
expect(
  await glm.evaluate((input) => input.matches(":focus-visible")),
).toBe(false);
await expect(glmChip).toHaveCSS(
  "background-color",
  "rgb(21, 59, 57)",
);
await expect(glmChip).toHaveCSS("border-top-width", "1px");

await page.keyboard.press("Tab");
await page.keyboard.press("Shift+Tab");
expect(
  await glm.evaluate((input) => input.matches(":focus-visible")),
).toBe(true);
const keyboardShadow = await glmChip.evaluate(
  (element) => getComputedStyle(element).boxShadow,
);
expect(keyboardShadow).toContain("inset");
```

Also compare the focused chip rectangle with its collapsed
`.metadata-options` rectangle and assert every edge is contained:

```ts
const bounds = await glmChip.evaluate((element) => {
  const chip = element.getBoundingClientRect();
  const options = element.closest(".metadata-options")!.getBoundingClientRect();
  return {
    left: chip.left >= options.left,
    top: chip.top >= options.top,
    right: chip.right <= options.right,
    bottom: chip.bottom <= options.bottom,
  };
});
expect(bounds).toEqual({
  left: true,
  top: true,
  right: true,
  bottom: true,
});
```

- [ ] **Step 4: Update mobile filter coverage**

In `tests/e2e/mobile.spec.ts`:

- remove the assertion that `tag-results` scrolls internally;
- assert `.tag-results-bounded` is absent;
- assert both facet groups have dynamic disclosure when fixture totals exceed
  their rendered previews;
- expand one facet and search an alias;
- retain the existing sheet close/focus restoration and page-width overflow
  assertions.

Use the rendered checkbox count and `tagOptionsByFacet[facet].length` to
construct each expected `Show X more` label.

- [ ] **Step 5: Update the narrow submission picker coverage**

Rename the project-submission E2E test to
`keeps the progressive manual tag picker usable at mobile width`.

Before choosing the six existing labels, expand whichever Goal or Trait group
contains a hidden target:

```ts
for (const groupName of ["Goals", "Traits"]) {
  const group = page.getByRole("group", { name: groupName });
  const disclosure = group.getByRole("button", {
    name: /Show \d+ more/u,
  });
  if ((await disclosure.count()) > 0) await disclosure.click();
}
```

Keep the existing assertions for `6 / 6 selected`, the disabled seventh
choice, and zero horizontal page overflow. Add:

```ts
await expect(
  page
    .getByLabel("Selected goals and traits")
    .getByRole("button", { name: /^Remove /u }),
).toHaveCount(6);
```

- [ ] **Step 6: Run the focused browser tests**

Run:

```powershell
npm.cmd run test:e2e -- --grep "progressively discloses goals and traits|model family with shareable state"
npm.cmd run test:e2e -- --grep "mobile browse and filter sheets"
npm.cmd run test:e2e -- --grep "progressive manual tag picker"
```

Expected: all selected catalog, mobile, and submission browser tests pass.

- [ ] **Step 7: Commit browser regression coverage**

```powershell
git add -- tests/helpers/generated-catalog.ts tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts tests/e2e/project-submission.spec.ts
git commit -m "test(filters): cover progressive tag UX"
```

---

### Task 4: Full Verification and Scope Audit

**Files:**

- Verify: `src/features/catalog/components/filter-choice-chip.tsx`
- Verify: `src/features/catalog/components/filter-controls.tsx`
- Verify: `src/features/catalog/components/tag-browser.tsx`
- Verify: `src/features/catalog/components/filter-panel.tsx`
- Verify: `src/features/submissions/components/project-submission-builder.tsx`
- Verify: `src/features/help/components/owner-card-fields.tsx`
- Verify: `src/styles/catalog.css`
- Verify: all tests modified in Tasks 1 through 3

**Interfaces:**

- Consumes: all previous task outputs.
- Produces: a clean, fully verified branch containing only the approved
  progressive tag-filter and shared chip changes.

- [ ] **Step 1: Audit obsolete selectors and hardcoded inventory copy**

Run:

```powershell
rg -n "tag-results-bounded|metadata-option:focus-within|Show all 36|Show all 19" src tests docs/reference/mockups/catalog-wall-responsive-v7.html
rg -n -U "\.tag-browser-option\s*\{[^}]*min-(block-)?size:\s*44px" src/styles/catalog.css
rg -n "metadata-filter-chip" src tests docs/reference/mockups/catalog-wall-responsive-v7.html
```

Expected:

- no production or test references to `tag-results-bounded`;
- no old production metadata/tag chip selectors;
- no `:focus-within` metadata focus rule;
- no hardcoded production Goal or Trait totals;
- `.metadata-filter-chip` remains only in the reference mockup and the
  reference-side selector passed by `reference-alignment.spec.ts`.

- [ ] **Step 2: Run focused unit verification**

Run:

```powershell
npm.cmd test -- tests/unit/filter-choice-chip.test.tsx tests/unit/tag-browser.test.tsx tests/unit/project-submission-builder.test.tsx tests/unit/project-owner-builder.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: every focused unit test passes with zero failures.

- [ ] **Step 3: Run the repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build,
typecheck, unit tests, production build, and static-export verification all
pass.

- [ ] **Step 4: Run complete browser and visual suites**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run test:visual
```

Expected: every E2E and visual test passes with zero unexpected failures.

- [ ] **Step 5: Inspect final scope**

Run:

```powershell
git status --short
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected:

- clean worktree;
- only the approved design, plan, shared chip, progressive TagBrowser,
  call-site, style, reference-mockup, helper, and test files changed;
- no registry, vocabulary, schema, workflow, generated catalog, or card
  presentation changes.
