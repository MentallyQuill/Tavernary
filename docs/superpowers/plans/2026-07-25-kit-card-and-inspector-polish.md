# Kit Card and Inspector Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish published Kit cards and replace viewed-Kit disclosures with the exact compact project-card presentation and direct project links.

**Architecture:** Keep Kit-level interaction in `KitCard`, centralize clipboard result and notice state in one catalog-owned hook/component pair, and pass one copy callback to both the Kit grid and Builder inspector. Reuse `ProjectCard` directly for every available Kit component; the inspector supplies layout and unavailable-component treatment without duplicating the ordinary compact card.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Vitest, Testing Library, Playwright, CSS

## Global Constraints

- The approved compact `ProjectCard` is the literal viewed-Kit visual contract.
- Available inspector project cards open `component.canonicalUrl` directly in a new tab.
- Inspector project cards expose no disclosure, `aria-expanded`, expanded detail block, or Kit-selection control.
- Null support renders no placeholder, tooltip, empty chip, or reserved gap.
- Project-count copy is `<count> Project` for one and `<count> Projects` otherwise.
- Copy tooltip copy is exactly `Copy a direct link to this Kit`.
- Report tooltip copy is exactly `Report this Kit on GitHub`.
- Successful copy notice copy is exactly `Kit URL copied to clipboard`.
- Copy failure notice copy is exactly `Couldn't copy automatically. Select the URL below.`
- Action hover and focus transitions last 150 milliseconds.
- Action press compression is `scale(0.98)`.
- Successful copy notices remain for 2,000 milliseconds and never stack.
- Tooltips do not appear in phone layouts.
- Reduced-motion mode removes action translation and scaling.
- Desktop inspect mode keeps Kit identity and actions visible while the project list scrolls.
- Phone inspect mode uses one sheet-content scroll and has no horizontal overflow at 320, 360, or 390 CSS pixels.
- Existing create, duplicate, edit, reorder, removal, moderation, support, share URL, and focus-return behavior must remain unchanged.
- Preserve unrelated working-tree changes and do not stage them.

---

## File Map

### Create

- `src/features/kits/use-kit-share-feedback.ts`
  - Own clipboard invocation, success/fallback state, the 2,000-millisecond
    success timer, replacement semantics, and cleanup.
- `src/features/kits/components/kit-share-notice.tsx`
  - Render the global success/fallback notice, polite live region, and selected
    readonly fallback URL.
- `tests/unit/kit-share-feedback.test.tsx`
  - Prove success timing, repeated-copy replacement, fallback behavior, and
    timer cleanup.
- `tests/unit/kit-project-stack.test.tsx`
  - Prove direct project links, exact `ProjectCard` reuse, authored order, and
    noninteractive unavailable cards.

### Modify

- `src/features/catalog/components/catalog-page.tsx`
  - Instantiate the shared share-feedback hook, pass one copy callback to Kit
    cards and Builder inspect mode, and render one notice surface.
- `src/features/kits/components/kit-card.tsx`
  - Add project-count tag, conditional support, and Copy/Report tooltips.
- `src/features/kits/components/kit-grid.tsx`
  - Preserve async-capable copy callback typing.
- `src/features/kits/components/kit-builder-panel.tsx`
  - Delegate copying upward, pass generated time into the project stack, add the
    bounded inspect layout, and remove local clipboard fallback state.
- `src/features/kits/components/kit-project-stack.tsx`
  - Remove disclosure state and render direct compact project cards.
- `src/styles/catalog.css`
  - Add Kit-card tag/action/notice styles, unavailable inspector treatment, and
    bounded desktop inspector list.
- `src/styles/responsive.css`
  - Make phone inspection use the sheet-content scroll and suppress
    motion transforms under reduced-motion.
- `tests/unit/kit-card.test.tsx`
  - Update metadata expectations and prove both tooltips.
- `tests/unit/kit-builder-panel.test.tsx`
  - Update copy delegation and inspect-layout expectations.
- `tests/unit/visual-alignment-contract.test.ts`
  - Lock the exact action, count-tag, scroll, and reduced-motion CSS contracts.
- `tests/kits-e2e/kits.spec.ts`
  - Replace disclosure behavior with direct-link and clipboard-feedback proof.
- `tests/kits-e2e/kits.visual.spec.ts`
  - Capture the refined Kit card, inspector card list, notice, and phone states.

### Read During Implementation

- `docs/superpowers/specs/2026-07-25-kit-card-and-inspector-polish-design.md`
- `src/features/catalog/components/project-card.tsx`
- `src/components/ui/tooltip.tsx`
- `src/features/kits/share-kit.ts`
- `tests/fixtures/kits/records.json`
- `tests/fixtures/kits/projects.json`

---

### Task 1: Centralize Kit copy feedback

**Files:**

- Create: `src/features/kits/use-kit-share-feedback.ts`
- Create: `src/features/kits/components/kit-share-notice.tsx`
- Create: `tests/unit/kit-share-feedback.test.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/kits/components/kit-grid.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Test: `tests/unit/kit-builder-panel.test.tsx`

**Interfaces:**

- Consumes:
  - `copyKitLink(kitId: string): Promise<"copied" | "fallback">`
  - `kitShareUrl(kitId: string): string`
- Produces:

```ts
export type KitShareFeedback =
  | { phase: "idle"; sequence: number }
  | { phase: "copied"; sequence: number }
  | { phase: "fallback"; sequence: number; url: string };

export function useKitShareFeedback(): {
  feedback: KitShareFeedback;
  copy: (kitId: string) => Promise<void>;
};

export function KitShareNotice({
  feedback,
}: {
  feedback: KitShareFeedback;
}): React.ReactNode;
```

- `KitBuilderPanel` gains:

```ts
now: string;
onCopyLink: (kitId: string) => void | Promise<void>;
```

- `KitGrid.onCopyLink` becomes:

```ts
(kitId: string) => void | Promise<void>
```

- [ ] **Step 1: Write failing hook and notice tests**

Create `tests/unit/kit-share-feedback.test.tsx` with a small harness:

```tsx
function Harness() {
  const share = useKitShareFeedback();
  return (
    <>
      <button type="button" onClick={() => void share.copy("story-kit-41")}>
        Copy
      </button>
      <KitShareNotice feedback={share.feedback} />
    </>
  );
}
```

Add these tests:

```tsx
test("shows one success notice for 2000ms", async () => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "Copy" }));
  expect(
    screen.getByRole("status", { name: "Kit URL copied to clipboard" }),
  ).toBeVisible();

  act(() => vi.advanceTimersByTime(1999));
  expect(screen.getByRole("status")).toBeVisible();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("repeated copy replaces the notice and restarts its timer", async () => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "Copy" }));
  act(() => vi.advanceTimersByTime(1500));
  await user.click(screen.getByRole("button", { name: "Copy" }));

  expect(screen.getAllByRole("status")).toHaveLength(1);
  act(() => vi.advanceTimersByTime(1999));
  expect(screen.getByRole("status")).toBeVisible();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("clipboard failure exposes and selects the share URL", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
  render(<Harness />);

  await userEvent.click(screen.getByRole("button", { name: "Copy" }));

  expect(
    screen.getByRole("status", {
      name: "Couldn't copy automatically. Select the URL below.",
    }),
  ).toBeVisible();
  const input = screen.getByRole("textbox", {
    name: "Kit link",
  }) as HTMLInputElement;
  expect(input.value).toContain("mode=kits&kit=story-kit-41");
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
});
```

Add exact timer-cleanup coverage:

```tsx
test("clears an active success timer on unmount", async () => {
  vi.useFakeTimers();
  const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const { unmount } = render(<Harness />);

  await user.click(screen.getByRole("button", { name: "Copy" }));
  unmount();

  expect(clearTimeoutSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-share-feedback.test.tsx
```

Expected: FAIL because the hook and notice modules do not exist.

- [ ] **Step 3: Implement the feedback state machine**

Create `src/features/kits/use-kit-share-feedback.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { copyKitLink, kitShareUrl } from "@/features/kits/share-kit";

export type KitShareFeedback =
  | { phase: "idle"; sequence: number }
  | { phase: "copied"; sequence: number }
  | { phase: "fallback"; sequence: number; url: string };

export function useKitShareFeedback() {
  const sequence = useRef(0);
  const timer = useRef<number | null>(null);
  const [feedback, setFeedback] = useState<KitShareFeedback>({
    phase: "idle",
    sequence: 0,
  });

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const copy = useCallback(
    async (kitId: string) => {
      clearTimer();
      sequence.current += 1;
      const current = sequence.current;
      const result = await copyKitLink(kitId);
      if (current !== sequence.current) return;
      if (result === "fallback") {
        setFeedback({
          phase: "fallback",
          sequence: current,
          url: kitShareUrl(kitId),
        });
        return;
      }
      setFeedback({ phase: "copied", sequence: current });
      timer.current = window.setTimeout(() => {
        setFeedback({ phase: "idle", sequence: current });
        timer.current = null;
      }, 2_000);
    },
    [clearTimer],
  );

  return { feedback, copy };
}
```

The sequence check prevents an older clipboard promise from overwriting a newer
copy result.

- [ ] **Step 4: Implement one global notice**

Create `src/features/kits/components/kit-share-notice.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

import type { KitShareFeedback } from "@/features/kits/use-kit-share-feedback";

export function KitShareNotice({
  feedback,
}: {
  feedback: KitShareFeedback;
}) {
  const fallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (feedback.phase === "fallback") fallbackRef.current?.select();
  }, [feedback]);

  if (feedback.phase === "idle") return null;

  const message =
    feedback.phase === "copied"
      ? "Kit URL copied to clipboard"
      : "Couldn't copy automatically. Select the URL below.";

  return (
    <aside
      key={feedback.sequence}
      className="kit-share-notice"
      data-tone={feedback.phase}
      role="status"
      aria-label={message}
      aria-live="polite"
      aria-atomic="true"
    >
      <span>{message}</span>
      {feedback.phase === "fallback" ? (
        <input
          ref={fallbackRef}
          aria-label="Kit link"
          readOnly
          value={feedback.url}
          onFocus={(event) => event.currentTarget.select()}
        />
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 5: Wire the hook once at catalog-page scope**

In `src/features/catalog/components/catalog-page.tsx`:

```tsx
const kitShare = useKitShareFeedback();
```

Replace the grid copy callback with:

```tsx
onCopyLink={kitShare.copy}
```

Add the same callback and generated timestamp to the existing
`KitBuilderPanel` invocation without changing its other props:

```tsx
now={catalog.generatedAt}
onCopyLink={kitShare.copy}
```

Render exactly one notice near the end of the catalog page:

```tsx
<KitShareNotice feedback={kitShare.feedback} />
```

Remove the direct `copyKitLink` import from `catalog-page.tsx`.

- [ ] **Step 6: Delegate Builder copying upward**

In `kit-builder-panel.tsx`:

- remove `fallbackUrl`, `fallbackRef`, and the fallback selection effect;
- remove the direct `copyKitLink` and `kitShareUrl` imports used by Copy link;
- add required `now` and `onCopyLink` props;
- change Copy link to:

```tsx
<button
  type="button"
  className="control-secondary"
  aria-label="Copy link"
  onClick={() => void onCopyLink(kit.id)}
>
  <CategoryIcon name="copy-link" />
  Copy link
</button>
```

- remove the Builder-local readonly fallback input.

Update every `KitBuilderPanel` unit render with fixed
`now="2026-07-24T00:00:00.000Z"` and `onCopyLink={() => undefined}` props.
Replace the old Builder-local fallback test with:

```tsx
test("delegates inspect-mode copying and preserves action URLs", async () => {
  const onCopyLink = vi.fn();
  render(
    <KitBuilderPanel
      state={{ mode: "inspect", collapsed: false, kitId: "story-kit-41" }}
      kit={fixtureKit()}
      now="2026-07-24T00:00:00.000Z"
      onCopyLink={onCopyLink}
      onCollapse={() => undefined}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect(onCopyLink).toHaveBeenCalledWith("story-kit-41");
  expect(screen.queryByRole("textbox", { name: "Kit link" })).toBeNull();
  expect(screen.getByRole("link", { name: "Report Kit" })).toHaveAttribute(
    "href",
    expect.stringContaining("kit-id=story-kit-41"),
  );
});
```

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-share-feedback.test.tsx tests/unit/kit-builder-panel.test.tsx
npm.cmd run typecheck
```

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 8: Commit**

```powershell
git add -- src/features/kits/use-kit-share-feedback.ts src/features/kits/components/kit-share-notice.tsx src/features/catalog/components/catalog-page.tsx src/features/kits/components/kit-grid.tsx src/features/kits/components/kit-builder-panel.tsx tests/unit/kit-share-feedback.test.tsx tests/unit/kit-builder-panel.test.tsx
git commit -m "feat(kits): add copy feedback"
```

---

### Task 2: Refine Kit card hierarchy and actions

**Files:**

- Modify: `src/features/kits/components/kit-card.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Test: `tests/unit/kit-card.test.tsx`
- Test: `tests/unit/kit-builder-panel.test.tsx`
- Test: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**

- Consumes:
  - `Tooltip`
  - `CatalogKit.components.length`
  - `CatalogKit.supporterCount`
- Produces:
  - `.kit-project-count-tag`
  - `.kit-card-action`
  - `.kit-card-copy`
  - `.kit-card-report`
  - exact Copy and Report tooltip content
  - the same Copy tooltip on the Builder inspect action

- [ ] **Step 1: Update KitCard tests first**

In `tests/unit/kit-card.test.tsx`, replace the lowercase metadata assertion:

```tsx
expect(screen.getByText("8 projects")).toBeVisible();
```

with:

```tsx
const count = screen.getByText("8 Projects");
expect(count).toHaveClass("kit-project-count-tag");
expect(screen.queryByText("8 projects")).not.toBeInTheDocument();
```

Add a local render helper above the tests:

```tsx
function renderCard(value: CatalogKit = kit()) {
  return render(
    <KitCard
      kit={value}
      now="2026-07-24T00:00:00.000Z"
      selected={false}
      onSelect={() => undefined}
      onCopyLink={() => undefined}
      onReport={() => undefined}
    />,
  );
}
```

Add singular coverage:

```tsx
test("uses singular project count copy", () => {
  renderCard(kit({ components: [kit().components[0]] }));
  expect(screen.getByText("1 Project")).toHaveClass("kit-project-count-tag");
});
```

Change null-support coverage:

```tsx
expect(screen.queryByText("Support unavailable")).not.toBeInTheDocument();
expect(screen.queryByText(/supporter/)).not.toBeInTheDocument();
```

Add tooltip coverage:

```tsx
test("explains Copy link and Report on hover and focus", async () => {
  const user = userEvent.setup();
  renderCard(kit());

  const copy = screen.getByRole("button", { name: "Copy link" });
  await user.hover(copy);
  expect(
    screen.getByRole("tooltip", {
      name: "Copy a direct link to this Kit",
    }),
  ).toBeVisible();

  await user.unhover(copy);
  const report = screen.getByRole("button", { name: "Report Kit" });
  report.focus();
  expect(
    screen.getByRole("tooltip", { name: "Report this Kit on GitHub" }),
  ).toBeVisible();
});
```

In `tests/unit/kit-builder-panel.test.tsx`, add:

```tsx
function renderInspectPanel() {
  return render(
    <KitBuilderPanel
      state={{ mode: "inspect", collapsed: false, kitId: "story-kit-41" }}
      kit={fixtureKit()}
      now="2026-07-24T00:00:00.000Z"
      onCopyLink={() => undefined}
      onCollapse={() => undefined}
    />,
  );
}

test("explains inspect-mode Copy link on hover and focus", async () => {
  renderInspectPanel();
  const copy = screen.getByRole("button", { name: "Copy link" });

  await userEvent.hover(copy);
  expect(
    screen.getByRole("tooltip", {
      name: "Copy a direct link to this Kit",
    }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Run the KitCard test and verify red**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-card.test.tsx
```

Expected: FAIL on project-count copy, null-support placeholder, and missing
tooltips.

- [ ] **Step 3: Implement the Kit card hierarchy**

In `kit-card.tsx`, import `useId` and `Tooltip`, create stable IDs, and change
the heading structure:

```tsx
const tooltipId = useId();
const projectCount = kit.components.length;

<span className="kit-card-heading">
  <CategoryIcon name="kit" />
  <span className="kit-card-identity">
    <h2 id={`${kit.id}-title`}>{kit.title}</h2>
    <small>@{kit.author.login}</small>
  </span>
  <b className="kit-project-count-tag">
    {projectCount} {projectCount === 1 ? "Project" : "Projects"}
  </b>
</span>
```

Change support metadata to conditional rendering:

```tsx
{kit.supporterCount === null ? null : (
  <span>
    {kit.supporterCount}{" "}
    {kit.supporterCount === 1 ? "supporter" : "supporters"}
  </span>
)}
```

Remove the old project-count metadata span.

- [ ] **Step 4: Wrap both actions in tooltips**

Use:

```tsx
<Tooltip
  id={`${tooltipId}-copy`}
  label="Copy a direct link to this Kit"
  className="control-tooltip"
>
  <button
    type="button"
    className="kit-card-action kit-card-copy"
    aria-label="Copy link"
    onClick={() => void onCopyLink(kit.id)}
  >
    <CategoryIcon name="copy-link" />
    Copy link
  </button>
</Tooltip>
```

and:

```tsx
<Tooltip
  id={`${tooltipId}-report`}
  label="Report this Kit on GitHub"
  className="control-tooltip"
>
  <button
    type="button"
    className="kit-card-action kit-card-report"
    aria-label="Report Kit"
    onClick={() => onReport(kit.id)}
  >
    <CategoryIcon name="report" />
    Report
  </button>
</Tooltip>
```

In `kit-builder-panel.tsx`, wrap the inspect-mode Copy link button with:

```tsx
<Tooltip
  id={`${tooltipId}-copy-kit-link-tooltip`}
  label="Copy a direct link to this Kit"
  className="control-tooltip"
>
  <button
    type="button"
    className="control-secondary"
    aria-label="Copy link"
    onClick={() => void onCopyLink(kit.id)}
  >
    <CategoryIcon name="copy-link" />
    Copy link
  </button>
</Tooltip>
```

Do not add a tooltip to the Builder's visible `Report Kit` link.

Update the `onCopyLink` prop type to `void | Promise<void>` in both `KitCard`
and `KitGrid`.

- [ ] **Step 5: Add exact count-tag and action CSS**

In `catalog.css`, add:

```css
.kit-card-heading {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
}

.kit-card-identity {
  display: grid;
  min-width: 0;
}

.kit-project-count-tag {
  align-self: start;
  border: 1px solid var(--color-kind-preset);
  border-radius: 999px;
  padding: 4px 7px;
  color: var(--color-kind-preset);
  background: var(--color-surface-primary);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}

.kit-card-action {
  cursor: pointer;
  transition:
    border-color 150ms var(--kit-motion-ease),
    color 150ms var(--kit-motion-ease),
    background 150ms var(--kit-motion-ease),
    transform 150ms var(--kit-motion-ease);
}

.kit-card-report {
  border-color: transparent;
  color: var(--color-muted);
  background: transparent;
}

.kit-card-action:is(:hover, :focus-visible) {
  border-color: var(--color-border-strong);
  color: var(--color-text-primary);
  background: var(--color-surface-raised);
  transform: translateY(-2px);
}

.kit-card-action:active {
  transform: scale(0.98);
  transition-duration: var(--kit-motion-press);
}
```

Retain the existing global focus-visible outline. Do not remove the button
border or visible labels.

In `responsive.css` reduced-motion rules, include:

```css
.kit-card-action,
.kit-card-action:is(:hover, :focus-visible),
.kit-card-action:active {
  transform: none;
}
```

- [ ] **Step 6: Lock the visual contract in the CSS test**

Add to `tests/unit/visual-alignment-contract.test.ts`:

```ts
test("locks Kit count and action motion", () => {
  const css = read("src/styles/catalog.css");
  const responsive = read("src/styles/responsive.css");

  expect(css).toMatch(
    /\.kit-project-count-tag\s*\{[^}]*border-radius:\s*999px[^}]*white-space:\s*nowrap/s,
  );
  expect(css).toMatch(
    /\.kit-card-action\s*\{[^}]*150ms[^}]*transform\s+150ms/s,
  );
  expect(css).toMatch(
    /\.kit-card-action:active\s*\{[^}]*scale\(0\.98\)/s,
  );
  expect(responsive).toMatch(
    /\.kit-card-action:active[^}]*\{[^}]*transform:\s*none/s,
  );
});
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-card.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- src/features/kits/components/kit-card.tsx src/features/kits/components/kit-grid.tsx src/features/kits/components/kit-builder-panel.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/kit-card.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/visual-alignment-contract.test.ts
git commit -m "feat(kits): polish Kit card actions"
```

---

### Task 3: Replace disclosures with exact project cards

**Files:**

- Modify: `src/features/kits/components/kit-project-stack.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Create: `tests/unit/kit-project-stack.test.tsx`
- Test: `tests/unit/kit-builder-panel.test.tsx`

**Interfaces:**

- Consumes:
  - `ProjectCard({ project, now })`
  - `CatalogKitComponent.project`
  - `CatalogKitComponent.canonicalUrl`
- Produces:

```ts
export function KitProjectStack({
  components,
  now,
}: {
  components: CatalogKitComponent[];
  now: string;
}): React.ReactNode;
```

- [ ] **Step 1: Create direct-link stack tests**

Create `tests/unit/kit-project-stack.test.tsx` with a complete
`CatalogProject` fixture and these assertions:

```tsx
function project({
  id,
  name,
  ...overrides
}: Pick<CatalogProject, "id" | "name"> &
  Partial<Omit<CatalogProject, "id" | "name">>): CatalogProject {
  return {
    id,
    name,
    kind: "extension",
    metadataStatus: "curated",
    sourceStatus: "healthy",
    primaryFunction: "memory-retrieval",
    summary: `${name} summary`,
    canonicalUrl: `https://example.com/projects/${id}`,
    catalogedAt: "2026-07-01T00:00:00.000Z",
    catalogCohort: "standard",
    frontends: [],
    capabilities: [],
    searchableText: name.toLocaleLowerCase(),
    attribution: {
      owner: "example-owner",
      contributors: [],
      humanContributorCount: 1,
      status: "current",
    },
    activity: {
      latestSourceActivityAt: "2026-07-24T00:00:00.000Z",
      activeWeeks12: 12,
      weeklyActivity: [
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ],
      evidenceStatus: "complete",
      dormant: false,
    },
    latestReleaseAt: null,
    community: null,
    repositorySizeKb: null,
    license: {
      status: "osi-approved",
      label: "MIT",
      tooltip: "MIT License",
    },
    preset: null,
    refreshedAt: "2026-07-24T00:00:00.000Z",
    staleSince: null,
    ...overrides,
  };
}

function component(value: CatalogProject): CatalogKitComponent {
  return {
    projectId: value.id,
    name: value.name,
    kind: value.kind,
    primaryFunction: value.primaryFunction,
    availability: "available",
    unavailableReason: null,
    canonicalUrl: value.canonicalUrl,
    project: value,
  };
}

test("renders available projects as ordinary compact project cards in order", () => {
  render(
    <KitProjectStack
      now="2026-07-24T00:00:00.000Z"
      components={[
        component(project({ id: "frontend", name: "Frontend" })),
        component(project({ id: "memory", name: "Memory" })),
      ]}
    />,
  );

  const links = screen.getAllByRole("link");
  expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
    "Frontend",
    "Memory",
  ]);
  expect(links[0]).toHaveClass("project-card", "kind-extension");
  expect(links[0]).toHaveAttribute(
    "href",
    "https://example.com/projects/frontend",
  );
  expect(links[0]).toHaveAttribute("target", "_blank");
  expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(document.querySelector("[aria-expanded]")).toBeNull();
  expect(document.querySelector(".project-kit-control")).toBeNull();
});

test("keeps unavailable projects visible and noninteractive", () => {
  render(
    <KitProjectStack
      now="2026-07-24T00:00:00.000Z"
      components={[
        {
          projectId: "flagged",
          name: "Flagged Tool",
          kind: "extension",
          primaryFunction: "memory-retrieval",
          availability: "flagged",
          unavailableReason: "unsafe-source",
          canonicalUrl: null,
          project: null,
        },
      ]}
    />,
  );

  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByText("Flagged Tool")).toBeVisible();
  expect(screen.getByText("unsafe-source")).toBeVisible();
  expect(
    screen.getByRole("group", { name: "Flagged Tool unavailable" }),
  ).toHaveAttribute("aria-disabled", "true");
});
```

Import `CatalogProject` and `CatalogKitComponent` as types. Do not use type
assertions that can hide a broken runtime shape.

- [ ] **Step 2: Run the stack test and verify red**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-project-stack.test.tsx
```

Expected: FAIL because the current stack renders disclosure buttons.

- [ ] **Step 3: Remove disclosure state and reuse ProjectCard**

Replace `kit-project-stack.tsx` with a stateless ordered list:

```tsx
import { CategoryIcon } from "@/components/icons/category-icon";
import { ProjectCard } from "@/features/catalog/components/project-card";
import type { CatalogKitComponent } from "@/features/kits/kit-types";

const kindLabels = {
  frontend: "Frontend",
  extension: "Extension",
  preset: "System Preset",
};

export function KitProjectStack({
  components,
  now,
}: {
  components: CatalogKitComponent[];
  now: string;
}) {
  return (
    <ol className="kit-project-stack" aria-label="Kit projects">
      {components.map((component) => {
        const available =
          component.availability === "available" &&
          component.project !== null &&
          component.canonicalUrl !== null;
        return (
          <li
            key={component.projectId}
            className={available ? undefined : "flagged"}
          >
            {available ? (
              <ProjectCard
                project={{
                  ...component.project,
                  canonicalUrl: component.canonicalUrl,
                }}
                now={now}
              />
            ) : (
              <div
                className={`project-card kit-project-card-unavailable kind-${component.kind}`}
                role="group"
                aria-label={`${component.name} unavailable`}
                aria-disabled="true"
              >
                <div className="card-top">
                  <span className="card-identity">
                    <span className="function-symbol">
                      <CategoryIcon
                        name={
                          component.primaryFunction as Parameters<
                            typeof CategoryIcon
                          >[0]["name"]
                        }
                      />
                    </span>
                    <span>{kindLabels[component.kind]}</span>
                  </span>
                  <span className="development-unavailable">Unavailable</span>
                </div>
                <h2>{component.name}</h2>
                <p className="card-summary">
                  {component.unavailableReason ?? "Project unavailable"}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

The canonical URL override makes the Kit component's reviewed link
authoritative while preserving all other generated project metadata.

- [ ] **Step 4: Pass the generated timestamp**

In `kit-builder-panel.tsx`, change:

```tsx
<KitProjectStack components={kit.components} />
```

to:

```tsx
<KitProjectStack components={kit.components} now={now} />
```

Update the Builder unit fixture so its three available components contain full
`CatalogProject` objects. Keep the flagged component's `project` and
`canonicalUrl` null.

Replace tests that click `Frontend project details`, `Memory project details`,
or `Preset project details` buttons with direct link assertions:

```tsx
expect(screen.getByRole("link", { name: "Frontend" })).toHaveAttribute(
  "href",
  "https://example.com/frontend",
);
expect(screen.queryByText("project details")).not.toBeInTheDocument();
expect(document.querySelector("[aria-expanded]")).toBeNull();
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-project-stack.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/project-card.test.tsx
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- src/features/kits/components/kit-project-stack.tsx src/features/kits/components/kit-builder-panel.tsx tests/unit/kit-project-stack.test.tsx tests/unit/kit-builder-panel.test.tsx
git commit -m "feat(kits): link inspector project cards"
```

---

### Task 4: Bound and scroll the inspector project list

**Files:**

- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Test: `tests/unit/kit-builder-panel.test.tsx`
- Test: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**

- Produces:
  - `data-mode="inspect"` on the open Builder aside.
  - `.kit-builder-panel-inspect-header`
  - `.kit-project-list`
  - `.kit-project-list-heading`

- [ ] **Step 1: Add failing inspect-layout assertions**

In `tests/unit/kit-builder-panel.test.tsx`, assert:

```tsx
const builder = screen.getByRole("complementary", { name: "Kit Builder" });
expect(builder).toHaveAttribute("data-mode", "inspect");
expect(
  screen.getByRole("heading", { name: "4 Projects" }),
).toHaveClass("kit-project-list-heading");
expect(screen.getByRole("list", { name: "Kit projects" })).toHaveClass(
  "kit-project-stack",
);
expect(
  screen.getByRole("heading", { name: "Story Kit" }).closest(
    ".kit-builder-panel-inspect-header",
  ),
).not.toBeNull();
```

In `visual-alignment-contract.test.ts`, add:

```ts
test("gives desktop Kit inspection one bounded project scroll", () => {
  const css = read("src/styles/catalog.css");
  const responsive = read("src/styles/responsive.css");

  expect(css).toMatch(
    /\.kit-builder-panel-inspect\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)[^}]*min-height:\s*0/s,
  );
  expect(css).toMatch(
    /\.kit-project-stack\s*\{[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/s,
  );
  expect(responsive).toMatch(
    /\.kit-project-stack\s*\{[^}]*overflow:\s*visible/s,
  );
});
```

- [ ] **Step 2: Run layout tests and verify red**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder-panel.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because the inspector is not divided into a fixed header and
scrolling list.

- [ ] **Step 3: Restructure inspect markup**

Set the Builder aside mode:

```tsx
data-mode={state.mode}
```

Structure inspect mode as:

```tsx
<div className="kit-builder-panel-inspect">
  <div className="kit-builder-panel-inspect-header">
    <header>
      <h2>{kit.title}</h2>
      <p>@{kit.author.login}</p>
    </header>
    <p>{kit.description}</p>
    <div className="kit-builder-panel-actions">
      <button
        type="button"
        className="control-secondary"
        onClick={() => onDuplicate?.(kit)}
      >
        <CategoryIcon name="duplicate" />
        Duplicate
      </button>
      <button
        type="button"
        className="control-secondary"
        onClick={() => onEdit?.(kit)}
      >
        Edit
      </button>
      <button
        type="button"
        className="control-secondary"
        aria-label="Copy link"
        onClick={() => void onCopyLink(kit.id)}
      >
        <CategoryIcon name="copy-link" />
        Copy link
      </button>
      <a
        className="control-quiet"
        href={issueUrl("06-kit-report.yml", kit)}
        target="_blank"
      >
        Report Kit
      </a>
      <a
        className="control-quiet"
        href={issueUrl("07-kit-withdrawal.yml", kit)}
        target="_blank"
      >
        Request withdrawal
      </a>
    </div>
  </div>
  <section
    className="kit-project-list"
    aria-labelledby={`${kit.id}-project-list-heading`}
  >
    <h3
      id={`${kit.id}-project-list-heading`}
      className="kit-project-list-heading"
    >
      {kit.components.length}{" "}
      {kit.components.length === 1 ? "Project" : "Projects"}
    </h3>
    <KitProjectStack components={kit.components} now={now} />
  </section>
</div>
```

Keep Copy, Duplicate, Edit, Report, and Request withdrawal in the fixed header.

- [ ] **Step 4: Add bounded desktop layout CSS**

Replace disclosure-row CSS with:

```css
.kit-builder-panel[data-mode="inspect"] .kit-builder-panel-body {
  overflow: hidden;
}

.kit-builder-panel-inspect {
  display: grid;
  height: 100%;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}

.kit-builder-panel-inspect-header {
  min-width: 0;
}

.kit-project-list {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
}

.kit-project-list-heading {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.kit-project-stack {
  display: grid;
  min-width: 0;
  min-height: 0;
  align-content: start;
  gap: 12px;
  margin: 0;
  padding: 2px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

.kit-project-stack > li {
  min-width: 0;
}

.kit-project-stack .project-card {
  width: 100%;
  min-height: 0;
}

.kit-project-card-unavailable {
  cursor: not-allowed;
  opacity: 0.72;
}
```

Delete obsolete `.kit-project-row`, `.kit-project-details`, and old bordered
list-item rules. Do not alter ordinary `.project-card` dimensions or content.

- [ ] **Step 5: Make phones use sheet-content scrolling**

In the phone block of `responsive.css`:

```css
.kit-builder-panel[data-mode="inspect"] .kit-builder-panel-body {
  overflow-y: auto;
}

.kit-builder-panel-inspect {
  display: block;
  height: auto;
}

.kit-project-list {
  display: grid;
  margin-top: 16px;
}

.kit-project-stack {
  overflow: visible;
}
```

Remove responsive rules targeting `.kit-project-row`.

- [ ] **Step 6: Run layout and regression tests**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder-panel.test.tsx tests/unit/kit-project-stack.test.tsx tests/unit/visual-alignment-contract.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/features/kits/components/kit-builder-panel.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/kit-builder-panel.test.tsx tests/unit/visual-alignment-contract.test.ts
git commit -m "feat(kits): scroll inspector project cards"
```

---

### Task 5: Style and verify the global share notice

**Files:**

- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Test: `tests/unit/visual-alignment-contract.test.ts`
- Test: `tests/unit/kit-share-feedback.test.tsx`

**Interfaces:**

- Consumes:
  - `.kit-share-notice`
  - `[data-tone="copied"]`
  - `[data-tone="fallback"]`
- Produces:
  - `@keyframes kit-share-notice-enter`
  - `@keyframes kit-share-notice-life`
  - a viewport-fixed notice above safe area and selection dock

- [ ] **Step 1: Add failing CSS contract assertions**

Add:

```ts
test("positions one animated Kit share notice above safe areas", () => {
  const css = read("src/styles/catalog.css");
  const responsive = read("src/styles/responsive.css");

  expect(css).toMatch(
    /\.kit-share-notice\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*120[^}]*bottom:\s*max\(22px,\s*env\(safe-area-inset-bottom\)\)/s,
  );
  expect(css).toContain("@keyframes kit-share-notice-enter");
  expect(css).toContain("@keyframes kit-share-notice-life");
  expect(css).toMatch(
    /\.kit-share-notice\[data-tone="copied"\]\s*\{[^}]*animation:\s*kit-share-notice-life\s+2000ms/s,
  );
  expect(responsive).toMatch(
    /\.kit-share-notice[^}]*\{[^}]*animation:\s*none/s,
  );
});
```

- [ ] **Step 2: Run the CSS test and verify red**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because notice CSS does not exist.

- [ ] **Step 3: Add notice CSS**

In `catalog.css`:

```css
.kit-share-notice {
  position: fixed;
  z-index: 120;
  right: max(22px, env(safe-area-inset-right));
  bottom: max(22px, env(safe-area-inset-bottom));
  display: grid;
  width: min(360px, calc(100vw - 44px));
  gap: 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  padding: 10px 12px;
  color: var(--color-text-primary);
  background: var(--color-surface-raised);
  box-shadow: var(--shadow-raised);
}

.catalog-shell:has(.project-selection-dock) .kit-share-notice {
  bottom: max(92px, calc(env(safe-area-inset-bottom) + 92px));
}

.kit-share-notice[data-tone="copied"] {
  border-color: var(--color-kind-extension);
  animation: kit-share-notice-life 2000ms var(--kit-motion-ease);
}

.kit-share-notice[data-tone="fallback"] {
  border-color: var(--color-kind-preset);
  animation: kit-share-notice-enter 150ms var(--kit-motion-ease);
}

.kit-share-notice input {
  width: 100%;
  min-width: 0;
}

@keyframes kit-share-notice-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes kit-share-notice-life {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }

  7.5%,
  90% {
    opacity: 1;
    transform: translateY(0);
  }

  100% {
    opacity: 0;
    transform: translateY(0);
  }
}
```

In reduced-motion CSS:

```css
.kit-share-notice {
  animation: none;
  transform: none;
}
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-share-feedback.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/styles/catalog.css src/styles/responsive.css tests/unit/visual-alignment-contract.test.ts
git commit -m "feat(kits): style copy feedback"
```

---

### Task 6: Prove direct navigation and scrolling in Playwright

**Files:**

- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts`

**Interfaces:**

- Consumes:
  - fixture Kit `alpha-kit-101`
  - fixture Kit `large-stack-103`
  - fixture Kit `flagged-stack-108`
  - `.kit-project-stack`
  - `.kit-builder-panel-inspect-header`
  - `.kit-share-notice`

- [ ] **Step 1: Replace the old disclosure E2E flow**

In the existing
`"inspects stacks, preserves caution rows, and builds contribution URLs"`
test, remove all `project details` button and `aria-expanded` assertions.

Add:

```ts
const inspector = page.getByRole("complementary", { name: "Kit Builder" });
const frontend = inspector.getByRole("link", {
  name: "Fixture Frontend",
  exact: true,
});
const tool = inspector.getByRole("link", {
  name: "Fixture Tool 02",
  exact: true,
});

await expect(frontend).toHaveAttribute(
  "href",
  "https://github.com/fixture/fixture-frontend",
);
await expect(tool).toHaveAttribute(
  "href",
  "https://github.com/fixture/fixture-tool-02",
);
await expect(frontend).toHaveAttribute("target", "_blank");
await expect(inspector.locator("[aria-expanded]")).toHaveCount(0);
await expect(inspector.locator(".project-kit-control")).toHaveCount(0);
```

Intercept one direct link without leaving the test:

```ts
await tool.evaluate((element) => {
  element.addEventListener("click", (event) => {
    event.preventDefault();
    sessionStorage.setItem(
      "inspector-project-url",
      (event.currentTarget as HTMLAnchorElement).href,
    );
  });
});
await tool.click();
expect(
  await page.evaluate(() => sessionStorage.getItem("inspector-project-url")),
).toBe("https://github.com/fixture/fixture-tool-02");
```

- [ ] **Step 2: Add copy notice and tooltip E2E proof**

Before clicking Copy link:

```ts
const card = page.getByRole("article", { name: "Alpha Kit" });
const cardCopy = card.getByRole("button", { name: "Copy link" });
await cardCopy.hover();
await expect(
  page.getByRole("tooltip", { name: "Copy a direct link to this Kit" }),
).toBeVisible();
await cardCopy.click();
await expect(
  page.getByRole("status", { name: "Kit URL copied to clipboard" }),
).toBeVisible();
```

For Report:

```ts
const cardReportButton = card.getByRole("button", { name: "Report Kit" });
await cardReportButton.hover();
await expect(
  page.getByRole("tooltip", { name: "Report this Kit on GitHub" }),
).toBeVisible();
```

Keep existing report URL assertions.

- [ ] **Step 3: Add large-Kit scroll proof**

Create:

```ts
test("scrolls a large desktop project stack under a fixed Kit header", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await openKits(page);
  await page.getByRole("button", { name: "Open Large Stack" }).click();

  const header = page.locator(".kit-builder-panel-inspect-header");
  const stack = page.locator(".kit-project-stack");
  const headerBefore = await header.boundingBox();
  const scroll = await stack.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);

  await stack.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    stack.getByRole("link", { name: "Fixture Tool 49", exact: true }),
  ).toBeInViewport();
  await expect(
    stack.getByRole("group", { name: "Fixture Flagged Tool unavailable" }),
  ).toBeVisible();
  expect((await header.boundingBox())?.y).toBe(headerBefore?.y);
});
```

- [ ] **Step 4: Add phone direct-link and overflow proof**

At 390, 360, and 320 CSS pixels:

```ts
for (const width of [390, 360, 320]) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();

  const sheet = page.getByRole("dialog", { name: "Kit Builder" });
  await expect(
    sheet.getByRole("link", { name: "Fixture Frontend", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Close Kit Builder" }).click();
}
```

- [ ] **Step 5: Build the Kit fixture and run E2E**

Run:

```powershell
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
```

Expected: every Kit E2E test PASS.

- [ ] **Step 6: Update visual scenarios**

In `kits.visual.spec.ts`, capture deterministic screenshots for:

- ordinary Kit card with numeric support and upper-right `3 Projects`;
- null-support Kit card with no support placeholder;
- Copy link hover;
- Report hover;
- visible success notice;
- Alpha Kit inspector with direct compact project cards;
- large Kit after scrolling;
- flagged unavailable card;
- 390-pixel phone inspector;
- 320-pixel phone inspector.

Use fixture data and exact locators. Do not create a second visual-only DOM
implementation.

- [ ] **Step 7: Run and inspect visual tests**

Run:

```powershell
npm.cmd run test:kits-visual
```

Expected: PASS after intentionally updating only screenshots changed by this
feature. Inspect every changed PNG for direct parity with the ordinary compact
project card before accepting it.

- [ ] **Step 8: Commit**

```powershell
git add -- tests/kits-e2e/kits.spec.ts tests/kits-e2e/kits.visual.spec.ts
git commit -m "test(kits): prove inspector card polish"
```

If Playwright updates tracked snapshots, add only the snapshots named by the
modified visual tests.

---

### Task 7: Run the complete verification gate

**Files:**

- Verify only; modify production or test files only when a failure is caused by
  this feature and the correction follows the approved design.

**Interfaces:**

- Consumes all prior task outputs.
- Produces a clean feature diff and complete verification evidence.

- [ ] **Step 1: Rebuild the deterministic Kit fixture**

Run:

```powershell
npm.cmd run build:test-kits
```

Expected: exit 0.

- [ ] **Step 2: Run all focused unit tests together**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-share-feedback.test.tsx tests/unit/kit-card.test.tsx tests/unit/kit-project-stack.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/project-card.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run Kit browser suites**

Run:

```powershell
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
```

Expected: PASS.

- [ ] **Step 4: Run the repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
unit tests, production build, and static-export verification all PASS.

- [ ] **Step 5: Verify no stale or forbidden UI remains**

Run:

```powershell
rg -n "Support unavailable|project details|aria-expanded|kit-project-details|kit-project-row" src/features/kits src/styles tests/unit tests/kits-e2e
```

Expected:

- no production `Support unavailable`;
- no viewed-Kit project disclosure copy or markup;
- no obsolete `.kit-project-details` or `.kit-project-row` CSS;
- `aria-expanded` remains only on unrelated legitimate controls.

- [ ] **Step 6: Review the final diff and whitespace**

Run:

```powershell
git status --short
git diff --check
git diff --stat
git diff -- src/features/kits src/features/catalog/components/catalog-page.tsx src/styles tests/unit tests/kits-e2e
```

Confirm:

- unrelated pre-existing changes are absent from feature commits;
- the inspector uses `ProjectCard` rather than copied markup;
- exactly one share notice can render;
- the direct-link URL comes from the reviewed Kit component;
- create/edit builder rows are unchanged;
- no horizontal-overflow workaround hides content.

---

## Completion Evidence

The implementation is complete only when the handoff reports:

- focused unit-test command and pass count;
- Kit E2E pass count;
- Kit visual pass count;
- `npm.cmd run check` result;
- confirmation that changed screenshots were inspected;
- confirmation that `Support unavailable` and disclosure UI are absent;
- confirmation that unrelated working-tree changes were untouched;
- final commit IDs created by the implementation.
