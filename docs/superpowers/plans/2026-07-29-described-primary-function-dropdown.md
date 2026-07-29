# Described Primary Function Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace detached primary-function definition lists in the submission and owner forms with one accessible dropdown whose open options show a label and muted description.

**Architecture:** Add a shared controlled `DescribedSelect` component that owns only disclosure and keyboard-navigation state. The two forms continue to own the selected vocabulary ID, validation, and manifest generation, so schemas and transport behavior remain unchanged.

**Tech Stack:** React 19, TypeScript 6, CSS custom properties, Testing Library, user-event, Vitest

## Global Constraints

- Apply the change to the public project submission form and the owner **Edit card details** form.
- Closed controls show only **Select a primary function** or the selected label.
- Open options show the existing vocabulary label and description.
- Do not change vocabulary IDs, manifests, schemas, transports, or validation rules.
- Support pointer, touch, Arrow Up, Arrow Down, Home, End, Enter, Space, Escape, outside dismissal, and visible focus.
- Preserve a minimum 44-pixel touch target and use existing semantic color tokens.
- Keep Frontend and System Preset owner fields read-only and unchanged.
- Write and observe failing tests before each production edit.

---

## File Structure

- Create `src/components/forms/described-select.tsx`: reusable controlled
  single-select behavior and accessible markup.
- Create `src/styles/described-select.css`: shared trigger, popup, option,
  description, state, and responsive styling.
- Modify `src/app/globals.css`: load the shared component stylesheet.
- Create `tests/unit/described-select.test.tsx`: isolated interaction and
  accessibility contract.
- Modify
  `src/features/submissions/components/project-submission-builder.tsx`: use
  the shared control and remove the detached definition list.
- Modify `tests/unit/project-submission-builder.test.tsx`: prove the compact
  resting state and preserve submission behavior.
- Modify
  `src/features/help/components/project-owner-builder.tsx`: use the shared
  control only for editable Extension primary functions.
- Modify `tests/unit/project-owner-builder.test.tsx`: prove owner-editor
  integration and preserve review-manifest behavior.

### Task 1: Shared DescribedSelect Component

**Files:**

- Create: `src/components/forms/described-select.tsx`
- Create: `src/styles/described-select.css`
- Modify: `src/app/globals.css:1-8`
- Test: `tests/unit/described-select.test.tsx`

**Interfaces:**

- Consumes:

  ```ts
  export interface DescribedSelectOption {
    id: string;
    label: string;
    description: string;
  }

  export interface DescribedSelectProps {
    id: string;
    label: string;
    value: string;
    placeholder: string;
    options: DescribedSelectOption[];
    onChange: (value: string) => void;
    required?: boolean;
    invalid?: boolean;
    describedBy?: string;
    error?: string;
  }
  ```

- Produces:

  ```ts
  export function DescribedSelect(
    props: DescribedSelectProps,
  ): React.ReactElement;
  ```

- [ ] **Step 1: Write failing component tests**

  Create `tests/unit/described-select.test.tsx` with a controlled harness and
  three focused tests:

  ```tsx
  import { cleanup, render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { afterEach, expect, test } from "vitest";
  import { useState } from "react";

  import {
    DescribedSelect,
    type DescribedSelectOption,
  } from "@/components/forms/described-select";

  const options: DescribedSelectOption[] = [
    {
      id: "memory-retrieval",
      label: "Memory and retrieval",
      description: "Stores and retrieves conversational knowledge.",
    },
    {
      id: "generation-reasoning",
      label: "Generation and reasoning",
      description: "Changes how model output is reasoned.",
    },
    {
      id: "interface-workflow",
      label: "Interface and workflow",
      description: "Improves user-facing interaction.",
    },
  ];

  function Harness({
    error,
  }: {
    error?: string;
  }) {
    const [value, setValue] = useState("");
    return (
      <DescribedSelect
        id="primary-function"
        label="Primary function"
        value={value}
        placeholder="Select a primary function"
        options={options}
        onChange={setValue}
        required
        invalid={Boolean(error)}
        error={error}
      />
    );
  }

  afterEach(cleanup);

  test("keeps descriptions inside the open menu and selects the option ID", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByLabelText("Primary function");
    expect(trigger).toHaveTextContent("Select a primary function");
    expect(
      screen.queryByText("Stores and retrieves conversational knowledge."),
    ).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(
      screen.getByText("Stores and retrieves conversational knowledge."),
    ).toBeVisible();

    await user.click(
      screen.getByRole("option", { name: /Generation and reasoning/u }),
    );

    expect(trigger).toHaveTextContent("Generation and reasoning");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  test("supports listbox keyboard navigation and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByLabelText("Primary function");
    trigger.focus();
    await user.keyboard("{Enter}");

    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveFocus();
    expect(listbox).toHaveAttribute(
      "aria-activedescendant",
      expect.stringContaining("memory-retrieval"),
    );

    await user.keyboard("{ArrowDown}{End}{Home}{ArrowDown}{Enter}");
    expect(trigger).toHaveTextContent("Generation and reasoning");
    expect(trigger).toHaveFocus();

    await user.keyboard("{Space}");
    expect(screen.getByRole("listbox")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("dismisses outside interaction and exposes required error semantics", async () => {
    const user = userEvent.setup();
    render(<Harness error="Choose a primary function." />);

    const trigger = screen.getByLabelText("Primary function");
    expect(trigger).toHaveAttribute("aria-required", "true");
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAccessibleDescription("Choose a primary function.");

    await user.click(trigger);
    await user.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run the isolated tests and verify RED**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/described-select.test.tsx
  ```

  Expected: FAIL because `@/components/forms/described-select` does not exist.
  Confirm the failure is the missing component, not a test syntax error.

- [ ] **Step 3: Implement the minimal controlled component**

  Create `src/components/forms/described-select.tsx` as a client component.
  Use:

  - a root ref for outside-interaction containment;
  - a trigger button with `aria-haspopup="listbox"`, `aria-expanded`,
    `aria-controls`, `aria-required`, `aria-invalid`, and composed
    `aria-describedby`;
  - a focused `role="listbox"` element with `tabIndex={-1}` and
    `aria-activedescendant`;
  - `role="option"` rows with stable IDs, `aria-selected`, label, and
    description spans;
  - `open` and `activeIndex` state only;
  - `useEffect` to focus the listbox after opening;
  - a document `pointerdown` listener while open to close outside interaction;
  - clamped Arrow navigation, Home/End jumps, Enter/Space selection, Escape
    dismissal, and Tab dismissal;
  - a `selectActiveOption()` helper that calls `onChange(option.id)`, closes,
    and restores trigger focus; and
  - an unknown-value fallback that displays the placeholder without changing
    the supplied value.

  Use `${id}-label`, `${id}-listbox`, `${id}-error`, and
  `${id}-option-${option.id}` for stable accessible relationships. Compose
  `describedBy` and the rendered error ID with
  `[describedBy, error ? errorId : undefined].filter(Boolean).join(" ")`.

- [ ] **Step 4: Add shared styling and global import**

  Create `src/styles/described-select.css` with:

  - `.described-select-field` as an 8-pixel-gap grid;
  - `.described-select-trigger` matching the current 44-pixel form controls;
  - a CSS chevron that rotates while expanded;
  - `.described-select-listbox` as an in-flow, bounded menu with
    `max-height: min(420px, 60vh)` and `overflow-y: auto`;
  - `.described-select-option` as a minimum-44-pixel, two-line option;
  - `.described-select-option-label` using primary text and semibold weight;
  - `.described-select-option-description` using
    `var(--color-text-muted)`, `0.84rem`, and `1.4` line height;
  - hover, active-descendant, selected, focus-visible, and invalid states using
    existing control and semantic tokens; and
  - no absolute positioning, so the menu cannot be clipped by help-form
    containers and remains usable at 320 pixels.

  Add this import after the token import in `src/app/globals.css`:

  ```css
  @import "../styles/described-select.css";
  ```

- [ ] **Step 5: Run the isolated tests and verify GREEN**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/described-select.test.tsx
  ```

  Expected: three tests PASS with no React accessibility or update warnings.

- [ ] **Step 6: Format and commit the shared unit**

  Run:

  ```powershell
  npm.cmd run format -- src/components/forms/described-select.tsx src/styles/described-select.css tests/unit/described-select.test.tsx src/app/globals.css
  npm.cmd test -- tests/unit/described-select.test.tsx
  git add src/components/forms/described-select.tsx src/styles/described-select.css tests/unit/described-select.test.tsx src/app/globals.css
  git commit -m "feat(forms): add described dropdown"
  ```

  Expected: formatting succeeds, the focused tests remain green, and the
  commit contains only the shared component unit.

### Task 2: Submission Form Integration

**Files:**

- Modify:
  `src/features/submissions/components/project-submission-builder.tsx:354-390`
- Modify: `tests/unit/project-submission-builder.test.tsx:60-125`

**Interfaces:**

- Consumes:

  ```ts
  import { DescribedSelect } from "@/components/forms/described-select";
  ```

  `extensionPrimaryFunctions` already supplies `{ id, label, description }[]`.

- Produces: no new exported API; `primaryFunction` remains the selected string
  ID used by `buildManifest()`.

- [ ] **Step 1: Update the integration test to require the compact dropdown**

  Add this helper near the test fixtures:

  ```ts
  async function choosePrimaryFunction(
    user: ReturnType<typeof userEvent.setup>,
    label: string,
  ) {
    await user.click(screen.getByLabelText("Primary function"));
    await user.click(screen.getByRole("option", { name: new RegExp(label, "u") }));
  }
  ```

  In `offers the six defined primary functions only for Extensions`, replace
  native-option assertions with:

  ```ts
  const primaryFunction = screen.getByLabelText("Primary function");
  expect(primaryFunction).toBeVisible();
  expect(
    screen.queryByText(
      /Stores, summarizes, searches, retrieves, or injects conversational knowledge and continuity/u,
    ),
  ).not.toBeInTheDocument();

  await user.click(primaryFunction);

  expect(screen.getAllByRole("option")).toHaveLength(6);
  expect(
    screen.getByText(
      /Stores, summarizes, searches, retrieves, or injects conversational knowledge and continuity/u,
    ),
  ).toBeVisible();
  ```

  Replace every `user.selectOptions` call targeting **Primary function** in
  this file with `choosePrimaryFunction(user, "<visible label>")`. Keep
  `user.selectOptions` for native **Project Type**.

- [ ] **Step 2: Run the submission test and verify RED**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/project-submission-builder.test.tsx
  ```

  Expected: FAIL because descriptions are still visible below the native
  select and clicking the native select does not reveal a listbox.

- [ ] **Step 3: Replace the native select and detached list**

  In `project-submission-builder.tsx`:

  - import `DescribedSelect`;
  - replace the `<select>` and `submission-option-help` `<ul>` with:

    ```tsx
    <DescribedSelect
      id="project-primary-function"
      label="Primary function"
      value={primaryFunction}
      placeholder="Select a primary function"
      options={extensionPrimaryFunctions}
      onChange={setPrimaryFunction}
      required
      invalid={Boolean(errorFor("primary-function"))}
      error={errorFor("primary-function")}
    />
    ```

  - remove the separate `InlineError` for
    `project-primary-function-error`, because the shared component renders and
    associates the same error; and
  - leave project-type reset logic and `buildManifest()` unchanged.

- [ ] **Step 4: Run focused submission and component tests**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/described-select.test.tsx tests/unit/project-submission-builder.test.tsx
  ```

  Expected: both files PASS, including stale-value reset and submitted
  primary-function ID assertions.

- [ ] **Step 5: Format and commit the submission integration**

  Run:

  ```powershell
  npm.cmd run format -- src/features/submissions/components/project-submission-builder.tsx tests/unit/project-submission-builder.test.tsx
  npm.cmd test -- tests/unit/described-select.test.tsx tests/unit/project-submission-builder.test.tsx
  git add src/features/submissions/components/project-submission-builder.tsx tests/unit/project-submission-builder.test.tsx
  git commit -m "feat(submissions): describe dropdown options"
  ```

  Expected: the focused tests stay green and the commit contains only the
  submission integration.

### Task 3: Owner Editor Integration and Full Verification

**Files:**

- Modify:
  `src/features/help/components/project-owner-builder.tsx:711-749`
- Modify: `tests/unit/project-owner-builder.test.tsx:460-490`

**Interfaces:**

- Consumes:

  ```ts
  import { DescribedSelect } from "@/components/forms/described-select";
  ```

- Produces: no new exported API; `primaryFunction` remains the proposed
  manifest's `primary_function`.

- [ ] **Step 1: Update the owner-editor regression test**

  Extend the `vocabularies.primaryFunctions` fixture with the other four
  approved Extension options so it contains the same six-option contract as
  production:

  ```ts
  {
    id: "memory-retrieval",
    label: "Memory and retrieval",
    description: "Stores and retrieves conversational knowledge.",
  },
  {
    id: "character-worldbuilding",
    label: "Character and worldbuilding",
    description: "Creates characters and narrative-world material.",
  },
  {
    id: "rpg-systems",
    label: "RPG systems and suites",
    description: "Provides game mechanics and structured world state.",
  },
  {
    id: "developer-infrastructure",
    label: "Developer infrastructure",
    description: "Provides developer-facing APIs and diagnostics.",
  },
  ```

  Then, in `reviews primary function before and after`, replace the native
  `user.selectOptions` call with:

  ```ts
  const primaryFunction = screen.getByLabelText("Primary function");
  expect(primaryFunction).toHaveTextContent("Interface and workflow");
  expect(
    screen.queryByText("Improves user-facing navigation and productivity."),
  ).not.toBeInTheDocument();

  await user.click(primaryFunction);
  expect(screen.getAllByRole("option")).toHaveLength(6);
  await user.click(
    screen.getByRole("option", { name: /Generation and reasoning/u }),
  );
  ```

  Keep the existing review-row assertions:

  ```ts
  expectReviewRow("Before: primary function", "interface-workflow");
  expectReviewRow("After: primary function", "generation-reasoning");
  ```

- [ ] **Step 2: Run the owner test and verify RED**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/project-owner-builder.test.tsx -t "reviews primary function before and after"
  ```

  Expected: FAIL because the owner editor still renders a native select and
  detached help definitions.

- [ ] **Step 3: Replace only the editable Extension control**

  In `project-owner-builder.tsx`:

  - import `DescribedSelect`;
  - derive the six options once beside the existing vocabulary-derived values:

    ```ts
    const editablePrimaryFunctions = vocabularies.primaryFunctions
      .filter((option) =>
        EXTENSION_PRIMARY_FUNCTION_IDS.includes(option.id),
      )
      .map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description ?? "",
      }));
    ```

  - replace the editable Extension `HelpSelectField` and
    `help-option-definitions` hint with:

    ```tsx
    <DescribedSelect
      id="owner-primary-function"
      label="Primary function"
      value={primaryFunction}
      placeholder="Select a primary function"
      options={editablePrimaryFunctions}
      onChange={setPrimaryFunction}
      required
    />
    ```

  - keep the read-only `HelpTextField` branch for Frontends and System Presets;
    and
  - keep `HelpSelectField` imported because the project selector still uses it.

- [ ] **Step 4: Run focused owner, submission, and component tests**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/described-select.test.tsx tests/unit/project-submission-builder.test.tsx tests/unit/project-owner-builder.test.tsx
  ```

  Expected: all three files PASS, including owner before/after review values,
  structural primary functions, submission reset behavior, and keyboard
  behavior.

- [ ] **Step 5: Run static verification**

  Run:

  ```powershell
  npm.cmd run format:check
  npm.cmd run lint
  npm.cmd run palette:audit
  npm.cmd run typecheck
  npm.cmd test
  npm.cmd run build
  ```

  Expected: every command exits 0 with no new warnings. If any command fails,
  fix only defects introduced by these changes and rerun the failing command
  plus the focused three-file test command.

- [ ] **Step 6: Inspect desktop and mobile rendering**

  Start the local site:

  ```powershell
  npm.cmd run dev
  ```

  In the in-app browser, open `/submit/project`, choose **Extension**, and
  inspect the primary-function field at 1280 pixels and 390 pixels wide.
  Verify:

  - no definition list appears while closed;
  - the menu expands in document flow without clipping or horizontal overflow;
  - all six descriptions are muted and readable;
  - selected, hover, keyboard-active, focus, and error states remain legible;
  - the next form field moves below the open menu; and
  - the owner **Edit card details** route renders the same interaction.

  Stop the development server after inspection.

- [ ] **Step 7: Format and commit the owner integration**

  Run:

  ```powershell
  npm.cmd run format -- src/features/help/components/project-owner-builder.tsx tests/unit/project-owner-builder.test.tsx
  npm.cmd test -- tests/unit/described-select.test.tsx tests/unit/project-submission-builder.test.tsx tests/unit/project-owner-builder.test.tsx
  git add src/features/help/components/project-owner-builder.tsx tests/unit/project-owner-builder.test.tsx
  git commit -m "feat(help): reuse described dropdown"
  ```

  Expected: focused tests remain green and the commit contains only the owner
  integration.

- [ ] **Step 8: Confirm the final repository state**

  Run:

  ```powershell
  git status --short
  git log -4 --oneline
  ```

  Expected: the worktree is clean and the design, shared component, submission
  integration, and owner integration commits are visible.
