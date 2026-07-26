# Kit Preview Action Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compact the Kit Builder preview actions, apply the three supplied icons only to those actions, and move the non-Frontend project breakdown beneath the Projects heading.

**Architecture:** Add one preview-specific icon component so the supplied artwork does not alter shared Kit-card icons. Keep project-kind aggregation inside the preview component because it is presentation-only derived data, then update the existing action and heading CSS without changing Kit state or data contracts.

**Tech Stack:** React 19, TypeScript 6, CSS, Vitest, Testing Library, Playwright, Next.js static export

## Global Constraints

- Preview action text is 12px and controls are 36px high on desktop.
- Preview controls use content width and wrap within their existing primary and administrative groups.
- Mobile controls retain the existing 44px minimum touch target.
- Duplicate, Copy link, and Report Kit use the supplied artwork with `currentColor`; Kit-card icons do not change.
- The project breakdown is a second 11px teal line beneath `PROJECTS`.
- Frontend and zero-count categories are omitted.
- Preset appears before Extension, with correct singular and plural labels.
- Preserve existing behavior, URLs, tooltips, and withdrawal danger states.
- Do not commit unless the user explicitly asks.

---

### Task 1: Preview actions and project breakdown

**Files:**
- Create: `src/features/kits/components/kit-preview-action-icon.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Test: `tests/unit/kit-builder-panel.test.tsx`
- Test: `tests/kits-e2e/kits.visual.spec.ts`

**Interfaces:**
- Consumes: `CatalogKit.components: CatalogKitComponent[]` and each component's `kind: "frontend" | "extension" | "preset"`.
- Produces: `KitPreviewActionIcon({ name }: { name: "duplicate" | "copy-link" | "report" }): React.ReactElement` and rendered `.kit-project-kind-summary` text.

- [x] **Step 1: Write failing component tests**

  Update the inspector expectations so the real rendered component must:

  ```tsx
  expect(within(summary).queryByText("4 Projects")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Projects" })).toBeVisible();
  expect(screen.getByText("1 Preset · 2 Extensions")).toHaveClass(
    "kit-project-kind-summary",
  );

  expect(screen.getByRole("button", { name: "Duplicate" }))
    .toHaveClass("kit-preview-action");
  expect(screen.getByRole("button", { name: "Duplicate" })
    .querySelector('[data-kit-preview-icon="duplicate"]')).not.toBeNull();
  expect(screen.getByRole("button", { name: "Copy link" })
    .querySelector('[data-kit-preview-icon="copy-link"]')).not.toBeNull();
  expect(screen.getByRole("link", { name: "Report Kit" })
    .querySelector('[data-kit-preview-icon="report"]')).not.toBeNull();
  ```

  Add a literal fixture variant with one Frontend and two Presets, then assert:

  ```tsx
  const breakdown = document.querySelector(".kit-project-kind-summary");
  expect(breakdown).toHaveTextContent("2 Presets");
  expect(breakdown).not.toHaveTextContent(/Extension|Frontend/);
  ```

- [x] **Step 2: Run the focused tests and verify RED**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/kit-builder-panel.test.tsx
  ```

  Expected: failures because the top count pill remains, the breakdown and preview-specific icon markers do not exist, and actions lack the compact preview class.

- [x] **Step 3: Add the preview-specific icon component**

  Create `kit-preview-action-icon.tsx` with the supplied Duplicate, Link, and Report path geometry. Each icon uses `fill="currentColor"`, `aria-hidden`, and `data-kit-preview-icon={name}`. Do not import or change `CategoryIcon`.

- [x] **Step 4: Render compact actions and the project breakdown**

  In `kit-builder-panel.tsx`:

  - Remove `.kit-project-count-tag` from the desktop inspect heading.
  - Count only `preset` and `extension` components.
  - Build labels in Preset-then-Extension order.
  - Omit any zero-count label.
  - Render a sibling `.kit-project-kind-summary` beneath the `PROJECTS` heading.
  - Add `.kit-preview-action` to each preview action control.
  - Replace the three preview action `CategoryIcon` instances with `KitPreviewActionIcon`.
  - Leave Edit and Request withdrawal text-only.

- [x] **Step 5: Apply compact responsive styling**

  In `catalog.css`, change the two action groups to wrapping flex rows, keep the Copy link tooltip wrapper content-sized, and style preview actions with:

  ```css
  .kit-builder-panel-actions .kit-preview-action {
    width: auto;
    min-height: 36px;
    padding: 0 11px;
    font-size: 12px;
    line-height: 1;
  }

  .kit-project-kind-summary {
    margin: -3px 0 0;
    color: var(--color-preset);
    font-size: 11px;
    letter-spacing: normal;
    line-height: 1.3;
  }
  ```

  In `responsive.css`, preserve `min-height: 44px` for `.kit-preview-action` while retaining content width and wrapping.

- [x] **Step 6: Run focused tests and verify GREEN**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/kit-builder-panel.test.tsx
  ```

  Expected: all tests in the file pass with no warnings.

- [x] **Step 7: Add rendered regression coverage**

  Extend the existing `alpha-kit-inspector.png` visual scenario with assertions that the top count pill is absent, the breakdown reads `2 Extensions` for that fixture, and the three supplied icon markers are visible before taking the screenshot. Retain the existing hover scenarios for Report Kit and Request withdrawal.

- [x] **Step 8: Build and run browser proof**

  Run:

  ```powershell
  npm.cmd run build:test-kits
  npm.cmd run test:kits-visual -- --update-snapshots
  ```

  Inspect the desktop inspector, Report hover, withdrawal hover, and narrow/mobile inspector output for compact controls, wrapping, icon alignment, and the two-line project heading.

- [x] **Step 9: Run final verification**

  Run:

  ```powershell
  npm.cmd run format:check
  npm.cmd run lint
  npm.cmd run typecheck
  npm.cmd test
  npm.cmd run build
  npm.cmd run verify:export
  ```

  Expected: every command exits 0. Review `git diff --check`, `git diff --stat`, and `git status --short`; preserve the unrelated untracked GitHub workflow plan.
