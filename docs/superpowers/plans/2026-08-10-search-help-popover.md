# Search Help Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible, compact search-syntax help popover beside the main catalog search field on desktop and mobile.

**Architecture:** A focused client component owns the help trigger, local open state, and document-level dismissal listeners. `SiteHeader` integrates that component while converting the search wrapper to valid label/input markup, and existing catalog styles provide a viewport-safe anchored panel without changing any search state or parsing code.

**Tech Stack:** React 19, TypeScript, Next.js, CSS, Vitest, Testing Library, Playwright

## Global Constraints

- Preserve the existing `+` OR semantics, space-separated AND semantics, URL serialization, filters, ranking, and `/` shortcut behavior.
- Use the supplied circular question-mark SVG paths with `currentColor`.
- Keep the help trigger visible on desktop and mobile; keep the existing `/` badge hidden at widths of 760px and below.
- Use the exact heading `Search basics`, accessible trigger name `Search help`, and the five approved instructions from the design.
- Dismiss on a second trigger activation, outside pointer activation, or Escape; Escape restores trigger focus.
- Keep the popover within an 8px viewport margin.
- Do not modify or stage unrelated worktree files.

---

### Task 1: Build the accessible search-help component

**Files:**
- Create: `src/components/icons/search-help-icon.tsx`
- Create: `src/features/search/components/search-help.tsx`
- Create: `tests/unit/search-help.test.tsx`

**Interfaces:**
- Consumes: React `useEffect`, `useId`, `useRef`, and `useState`.
- Produces: `SearchHelpIcon(): JSX.Element` and `SearchHelp(): JSX.Element`.

- [ ] **Step 1: Write failing interaction tests**

Create `tests/unit/search-help.test.tsx` with real DOM interactions:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";

import { SearchHelp } from "@/features/search/components/search-help";

afterEach(cleanup);

test("opens the approved search instructions and toggles closed", async () => {
  const user = userEvent.setup();
  render(<SearchHelp />);
  const trigger = screen.getByRole("button", { name: "Search help" });

  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const dialog = screen.getByRole("dialog", { name: "Search basics" });
  expect(dialog).toHaveTextContent("A B");
  expect(dialog).toHaveTextContent("matches results containing A and B");
  expect(dialog).toHaveTextContent("A+B");
  expect(dialog).toHaveTextContent("matches results containing A or B");
  expect(dialog).toHaveTextContent("A+B C");
  expect(dialog).toHaveTextContent("matches A, or both B and C");
  expect(dialog).toHaveTextContent("Search-result URLs can be copied and shared");
  expect(dialog).toHaveTextContent("Press / anywhere on the page to jump to search");

  await user.click(trigger);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("dismisses outside and restores trigger focus after Escape", async () => {
  const user = userEvent.setup();
  render(<><SearchHelp /><button type="button">Outside</button></>);
  const trigger = screen.getByRole("button", { name: "Search help" });

  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Outside" }));
  expect(screen.queryByRole("dialog")).toBeNull();

  await user.click(trigger);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/search-help.test.tsx
```

Expected: FAIL because `@/features/search/components/search-help` does not exist.

- [ ] **Step 3: Add the icon from the supplied SVG**

Create `src/components/icons/search-help-icon.tsx`:

```tsx
export function SearchHelpIcon() {
  return (
    <svg
      aria-hidden="true"
      data-icon="search-help"
      fill="currentColor"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
      <path d="M12 6a3.5 3.5 0 0 0-3.5 3.5 1 1 0 0 0 2 0A1.5 1.5 0 1 1 12 11a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-1.16A3.49 3.49 0 0 0 12 6z" />
      <circle cx="12" cy="17" r="1" />
    </svg>
  );
}
```

- [ ] **Step 4: Implement the minimal interactive component**

Create `src/features/search/components/search-help.tsx` as a client component. Use `useId()` for the panel and heading IDs, a button ref for focus restoration, and a root ref for outside detection. While open, register `pointerdown` and `keydown` listeners on `document`, remove them during cleanup, and render this semantic content:

```tsx
<span className="search-help" ref={rootRef}>
  <button
    aria-controls={panelId}
    aria-expanded={open}
    aria-label="Search help"
    className="search-help-trigger"
    onClick={() => setOpen((current) => !current)}
    ref={triggerRef}
    type="button"
  >
    <SearchHelpIcon />
  </button>
  {open ? (
    <section
      aria-labelledby={headingId}
      className="search-help-popover"
      id={panelId}
      role="dialog"
    >
      <h2 id={headingId}>Search basics</h2>
      <ul>
        <li><code>A B</code><span>matches results containing A and B.</span></li>
        <li><code>A+B</code><span>matches results containing A or B.</span></li>
        <li><code>A+B C</code><span>matches A, or both B and C.</span></li>
      </ul>
      <p>Search-result URLs can be copied and shared.</p>
      <p>Press <kbd>/</kbd> anywhere on the page to jump to search.</p>
    </section>
  ) : null}
</span>
```

The Escape handler must call `setOpen(false)` and `triggerRef.current?.focus()`. The outside handler must close only when `rootRef.current?.contains(event.target as Node)` is false.

- [ ] **Step 5: Run the focused unit test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/search-help.test.tsx
```

Expected: 2 tests PASS with no warnings.

- [ ] **Step 6: Commit the component**

```powershell
git add src/components/icons/search-help-icon.tsx src/features/search/components/search-help.tsx tests/unit/search-help.test.tsx
git commit -m "feat(search): add help popover"
```

### Task 2: Integrate and style the control across breakpoints

**Files:**
- Modify: `src/features/catalog/components/site-header.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: `SearchHelp()` from Task 1 and the existing `searchRef`, `search`, and `onSearch` header props.
- Produces: Valid search-region markup containing the existing input, `/` badge, and help trigger.

- [ ] **Step 1: Add failing desktop and mobile browser assertions**

In `tests/e2e/catalog.spec.ts`, extend the main-search focus test to assert the ordering and interaction:

```ts
const shortcut = page.locator(".site-search > kbd");
const help = page.getByRole("button", { name: "Search help" });
await expect(shortcut).toBeVisible();
await expect(help).toBeVisible();
const shortcutBox = await shortcut.boundingBox();
const helpBox = await help.boundingBox();
expect(shortcutBox).not.toBeNull();
expect(helpBox).not.toBeNull();
expect(helpBox!.x).toBeGreaterThan(shortcutBox!.x);
await help.click();
await expect(page.getByRole("dialog", { name: "Search basics" })).toBeVisible();
await page.keyboard.press("Escape");
await expect(help).toBeFocused();
await page.keyboard.press("/");
await expect(search).toBeFocused();
```

In `tests/e2e/mobile.spec.ts`, add a test that asserts the slash badge is hidden, the help trigger is visible, and the open panel stays within the 390px viewport:

```ts
test("keeps search help available within the mobile viewport", async ({ page }) => {
  await page.goto(sitePath());
  await expect(page.locator(".site-search > kbd")).toBeHidden();
  const help = page.getByRole("button", { name: "Search help" });
  await expect(help).toBeVisible();
  await help.click();
  const dialog = page.getByRole("dialog", { name: "Search basics" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(8);
  expect(box!.x + box!.width).toBeLessThanOrEqual(382);
});
```

- [ ] **Step 2: Build the static site and verify browser RED**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts --grep "main search|search help"
```

Expected: FAIL because no `Search help` button exists in the header.

- [ ] **Step 3: Integrate valid search markup**

In `site-header.tsx`, import `SearchHelp`, change the wrapping `<label className="site-search">` to `<div className="site-search" role="search">`, add `<label className="visually-hidden" htmlFor="catalog-search">Search projects</label>`, set `id="catalog-search"` on the input, retain its existing `aria-label`, and render `<SearchHelp />` after the existing `<kbd>/</kbd>`.

- [ ] **Step 4: Add compact themed styling**

In `catalog.css`, add rules with these contracts:

```css
.search-help {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
}

.search-help-trigger {
  display: grid;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  padding: 5px;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
  place-items: center;
}

.search-help-trigger:hover,
.search-help-trigger[aria-expanded="true"] {
  color: var(--color-text-primary);
  background: var(--color-bg-surface-active);
}

.search-help-trigger:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.search-help-trigger svg {
  width: 18px;
  height: 18px;
}

.search-help-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 10px);
  right: 0;
  width: min(320px, calc(100vw - 16px));
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  padding: 14px;
  color: var(--color-text-secondary);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-overlay);
  overflow-wrap: anywhere;
}
```

Add focused heading, list, paragraph, `<code>`, and `<kbd>` spacing using existing theme tokens. Do not let the broad `.site-search svg` rule override the 18px icon dimensions. Under `@media (pointer: coarse)`, add a 44px pseudo-element hit target around `.search-help-trigger`. Under `@media (prefers-reduced-motion: reduce)`, disable the popover transition if one is present.

Keep the existing mobile `.site-search kbd { display: none; }` rule scoped so it does not hide the `<kbd>` inside `.search-help-popover`; change the selector to `.site-search > kbd` in both base and responsive styles where necessary.

- [ ] **Step 5: Rebuild and verify browser GREEN**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts --grep "main search|search help"
```

Expected: desktop and mobile search-help tests PASS, including panel bounds and `/` focus behavior.

- [ ] **Step 6: Run focused unit and visual-contract tests**

Run:

```powershell
npm.cmd test -- tests/unit/search-help.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the integration**

```powershell
git add src/features/catalog/components/site-header.tsx src/styles/catalog.css src/styles/responsive.css tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
git commit -m "feat(search): expose help on all screens"
```

### Task 3: Run release gates and prepare the PR

**Files:**
- Modify only files required to repair a demonstrated failure from the gates below.

**Interfaces:**
- Consumes: the complete feature from Tasks 1 and 2.
- Produces: a verified branch ready for GitHub review and merge.

- [ ] **Step 1: Run formatting and static analysis**

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run palette:audit
npm.cmd run typecheck
```

Expected: every command exits 0 with no errors.

- [ ] **Step 2: Run the complete automated suite**

```powershell
npm.cmd test
```

Expected: all test files and tests PASS.

- [ ] **Step 3: Run the production and static-export gates**

```powershell
npm.cmd run build
npm.cmd run verify:export
```

Expected: production build and static-export verification exit 0.

- [ ] **Step 4: Run the complete relevant browser suites**

```powershell
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts tests/e2e/mobile.spec.ts
```

Expected: the complete catalog and mobile browser suites PASS.

- [ ] **Step 5: Review the final diff and branch state**

```powershell
git diff origin/main...HEAD --check
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no uncommitted files, and only the design, plan, component, integration, and test commits are present.

- [ ] **Step 6: Publish and merge**

Push `codex/search-help-popover`, open a ready PR summarizing behavior and verification, wait for required GitHub checks, address any actionable review feedback, and merge only after all required checks pass.
