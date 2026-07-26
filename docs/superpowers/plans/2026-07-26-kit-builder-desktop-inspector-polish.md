# Kit Builder Desktop Inspector Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop Kit inspector's nested project-list scrollbar with one narrow panel-body scrollbar, recover card width without enlarging the panel, and align the Kit summary and administrative actions with Tavernary's existing visual language.

**Architecture:** Keep the current Kit Builder grid track, collapsed-state contract, and shared `ProjectCard` rendering. Add a small scroll-boundary hook so `KitBuilderPanel` can expose truthful top/bottom overflow feedback, wrap the existing body in a non-scrolling frame for edge fades, and move desktop inspect scrolling from `KitProjectStack` to the complete panel body. Use dedicated inspector-summary markup and semantic control classes rather than broad panel typography selectors.

**Tech Stack:** React 19, TypeScript, Next.js static export, CSS, Vitest, Testing Library, Playwright

## Global Constraints

- The desktop `--kit-builder-expanded-width` and catalog grid tracks remain unchanged.
- `.catalog-layout[data-kit-builder-collapsed]` remains the only layout-state source; do not restore descendant `:has(...)` state inference.
- Desktop inspect mode has exactly one internal vertical scroll owner: `.kit-builder-panel-body`.
- `.kit-project-stack` must not establish a vertical scrollport.
- The desktop scrollbar is 6px in WebKit, `thin` where supported, always discoverable when overflow exists, and uses semantic palette tokens.
- Desktop horizontal panel padding is 12px; inspect body and project-stack inline padding are zero.
- At the 1440px Chromium baseline, the project card gains at least 12px without changing the panel's rendered outer width.
- The desktop inspected Kit title is 17px/720, author is 10px/500, and description is 11px at 1.48 line-height with an exact four-line clamp.
- The project count appears in the existing upper-right Kit count tag; the project list retains an accessible **Projects** heading.
- Report Kit is a secondary bordered link; Request withdrawal is a restrained danger-outline link.
- Desktop controls are 36px high. Mobile controls remain at least 44px high.
- Mobile sheet structure, scroll ownership, focus trapping, safe areas, and direct project links remain unchanged.
- Mobile summary hierarchy, typography, and `{count} Projects` heading remain unchanged.
- Project order, canonical URLs, unavailable-card semantics, issue URLs, copying, duplication, and editing behavior remain unchanged.
- Do not add a custom project-card composition, carousel, pagination, accordion, hidden scrollbar, or general-purpose scrollbar system.
- Use semantic palette tokens; `npm.cmd run palette:audit` must pass.
- Approved design: `docs/superpowers/specs/2026-07-26-kit-builder-desktop-inspector-polish-design.md`.

---

## File Map

### Create

- `src/features/kits/use-scroll-boundaries.ts`
  - Pure boundary calculation plus the React hook that observes scrolling and
    size/content changes.
- `tests/unit/use-scroll-boundaries.test.tsx`
  - Boundary arithmetic and rendered hook behavior.

### Modify

- `src/features/kits/components/kit-builder-panel.tsx`
  - Body frame/ref, boundary feedback, inspector summary markup, count tag, and
    administrative button classes.
- `src/styles/catalog.css`
  - Desktop body scroll ownership, scrollbar, fades, gutters, summary type,
    action layout, and withdrawal treatment.
- `src/styles/responsive.css`
  - Preserve phone frame/body sizing and 44px action behavior after the desktop
    markup changes.
- `tests/unit/kit-builder-panel.test.tsx`
  - Summary semantics, count placement, action treatments, URLs, and boundary
    data attributes.
- `tests/unit/visual-alignment-contract.test.ts`
  - Static CSS contracts for one scroll owner, unchanged panel width, narrow
    scrollbar, recovered gutter, typography, and button treatment.
- `tests/kits-e2e/kits.spec.ts`
  - Replace the old fixed-action/nested-stack proof with complete panel-body
    scrolling and rendered-width geometry.
- `tests/kits-e2e/kits.visual.spec.ts`
  - Scroll the body rather than the stack and capture administrative control
    states.
- `tests/kits-e2e/kits.visual.spec.ts-snapshots/*.png`
  - Refresh only inspector baselines whose approved pixels change.

---

### Task 1: Scroll-boundary state and body frame

**Files:**

- Create: `src/features/kits/use-scroll-boundaries.ts`
- Create: `tests/unit/use-scroll-boundaries.test.tsx`
- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Test: `tests/unit/use-scroll-boundaries.test.tsx`
- Test: `tests/unit/kit-builder-panel.test.tsx`
- Test: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**

- Produces:
  - `type ScrollBoundaries = { canScrollUp: boolean; canScrollDown: boolean }`
  - `readScrollBoundaries(element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">): ScrollBoundaries`
  - `useScrollBoundaries(ref: RefObject<HTMLElement | null>, active: boolean, contentKey: string): ScrollBoundaries`
- `KitBuilderPanel` consumes the hook through a `panelBodyRef`.
- CSS in Task 3 consumes `data-can-scroll-up="true"` and
  `data-can-scroll-down="true"` on `.kit-builder-panel-body-frame`.

- [ ] **Step 1: Write failing boundary arithmetic tests**

Create `tests/unit/use-scroll-boundaries.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, test } from "vitest";

import {
  readScrollBoundaries,
  useScrollBoundaries,
} from "@/features/kits/use-scroll-boundaries";

test("reports only directions containing hidden content", () => {
  expect(
    readScrollBoundaries({
      clientHeight: 300,
      scrollHeight: 900,
      scrollTop: 0,
    }),
  ).toEqual({ canScrollDown: true, canScrollUp: false });

  expect(
    readScrollBoundaries({
      clientHeight: 300,
      scrollHeight: 900,
      scrollTop: 300,
    }),
  ).toEqual({ canScrollDown: true, canScrollUp: true });

  expect(
    readScrollBoundaries({
      clientHeight: 300,
      scrollHeight: 900,
      scrollTop: 600,
    }),
  ).toEqual({ canScrollDown: false, canScrollUp: true });
});

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const boundaries = useScrollBoundaries(ref, true, "kit:3");
  return (
    <div
      ref={ref}
      data-testid="scroller"
      data-up={boundaries.canScrollUp}
      data-down={boundaries.canScrollDown}
    />
  );
}

test("updates rendered boundary state on scroll", () => {
  render(<Harness />);
  const scroller = screen.getByTestId("scroller");

  Object.defineProperties(scroller, {
    clientHeight: { configurable: true, value: 300 },
    scrollHeight: { configurable: true, value: 900 },
    scrollTop: { configurable: true, writable: true, value: 0 },
  });

  fireEvent.scroll(scroller);
  expect(scroller).toHaveAttribute("data-up", "false");
  expect(scroller).toHaveAttribute("data-down", "true");

  scroller.scrollTop = 600;
  fireEvent.scroll(scroller);
  expect(scroller).toHaveAttribute("data-up", "true");
  expect(scroller).toHaveAttribute("data-down", "false");
});
```

- [ ] **Step 2: Run the new test to verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/use-scroll-boundaries.test.tsx
```

Expected: FAIL because `@/features/kits/use-scroll-boundaries` does not exist.

- [ ] **Step 3: Implement the pure calculation and hook**

Create `src/features/kits/use-scroll-boundaries.ts`:

```ts
import {
  type RefObject,
  useLayoutEffect,
  useState,
} from "react";

export type ScrollBoundaries = {
  canScrollDown: boolean;
  canScrollUp: boolean;
};

const settled: ScrollBoundaries = {
  canScrollDown: false,
  canScrollUp: false,
};

export function readScrollBoundaries(
  element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">,
): ScrollBoundaries {
  const epsilon = 1;
  return {
    canScrollDown:
      element.scrollTop + element.clientHeight <
      element.scrollHeight - epsilon,
    canScrollUp: element.scrollTop > epsilon,
  };
}

export function useScrollBoundaries(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  contentKey: string,
): ScrollBoundaries {
  const [boundaries, setBoundaries] = useState(settled);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) {
      setBoundaries(settled);
      return;
    }

    const update = () => {
      const next = readScrollBoundaries(element);
      setBoundaries((current) =>
        current.canScrollDown === next.canScrollDown &&
        current.canScrollUp === next.canScrollUp
          ? current
          : next,
      );
    };

    update();
    element.addEventListener("scroll", update, { passive: true });

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(update);
    observer?.observe(element);
    if (element.firstElementChild instanceof HTMLElement) {
      observer?.observe(element.firstElementChild);
    }

    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [active, contentKey, ref]);

  return boundaries;
}
```

- [ ] **Step 4: Wire a stable body frame into `KitBuilderPanel`**

In `kit-builder-panel.tsx`, import `useScrollBoundaries`, add
`panelBodyRef`, and calculate the content key:

```tsx
import { useScrollBoundaries } from "@/features/kits/use-scroll-boundaries";

const panelBodyRef = useRef<HTMLDivElement>(null);
const inspectScrollActive =
  !phone && state.mode === "inspect" && kit !== null;
const scrollBoundaries = useScrollBoundaries(
  panelBodyRef,
  inspectScrollActive,
  `${state.mode}:${kit?.id ?? "none"}:${kit?.components.length ?? 0}`,
);
```

Insert this frame opening tag immediately before the existing
`<div className="kit-builder-panel-body">`:

```tsx
<div
  className="kit-builder-panel-body-frame"
  data-can-scroll-up={
    scrollBoundaries.canScrollUp ? "true" : undefined
  }
  data-can-scroll-down={
    scrollBoundaries.canScrollDown ? "true" : undefined
  }
>
```

Change the existing body opening tag to:

```tsx
<div ref={panelBodyRef} className="kit-builder-panel-body">
```

Immediately after that body's existing closing tag, add the fade siblings and
close the frame:

```tsx
  {inspectScrollActive && scrollBoundaries.canScrollUp ? (
    <span
      className="kit-builder-scroll-fade kit-builder-scroll-fade-top"
      aria-hidden="true"
    />
  ) : null}
  {inspectScrollActive && scrollBoundaries.canScrollDown ? (
    <span
      className="kit-builder-scroll-fade kit-builder-scroll-fade-bottom"
      aria-hidden="true"
    />
  ) : null}
</div>
```

Do not change any mode branching, callbacks, modal behavior, collapsed markup,
or project data in this step.

- [ ] **Step 5: Preserve the current layout through the new frame**

Move the existing fixed body width to the frame without changing the current
18px panel inset or inspect-mode scroll ownership:

```css
.kit-builder-panel-body-frame {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.kit-builder-panel-body {
  width: 100%;
  height: 100%;
}

.kit-builder-panel-header,
.kit-builder-panel-body-frame {
  width: calc(var(--kit-builder-expanded-width) - 37px);
  min-width: calc(var(--kit-builder-expanded-width) - 37px);
  align-self: flex-end;
}

.kit-builder-scroll-fade {
  display: none;
}
```

Remove `.kit-builder-panel-body` from the old shared fixed-width selector.

In the existing phone media query, move the width reset from the body to the
frame:

```css
.kit-builder-panel-header,
.kit-builder-panel-body-frame {
  width: auto;
  min-width: 0;
  align-self: stretch;
}
```

Update `visual-alignment-contract.test.ts` to require the frame in the fixed
desktop width selector and the phone width-reset selector. Do not change the
existing nested-stack scroll assertions in this task.

- [ ] **Step 6: Add a component regression for boundary attributes**

In `tests/unit/kit-builder-panel.test.tsx`, render the inspect panel, define
body geometry, and dispatch scrolling:

```tsx
test("exposes truthful desktop inspector scroll boundaries", () => {
  renderInspectPanel();
  const body = document.querySelector<HTMLElement>(
    ".kit-builder-panel-body",
  );
  const frame = document.querySelector<HTMLElement>(
    ".kit-builder-panel-body-frame",
  );
  expect(body).not.toBeNull();
  expect(frame).not.toBeNull();

  Object.defineProperties(body!, {
    clientHeight: { configurable: true, value: 300 },
    scrollHeight: { configurable: true, value: 900 },
    scrollTop: { configurable: true, writable: true, value: 0 },
  });
  fireEvent.scroll(body!);
  expect(frame).not.toHaveAttribute("data-can-scroll-up");
  expect(frame).toHaveAttribute("data-can-scroll-down", "true");

  body!.scrollTop = 600;
  fireEvent.scroll(body!);
  expect(frame).toHaveAttribute("data-can-scroll-up", "true");
  expect(frame).not.toHaveAttribute("data-can-scroll-down");
});
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npx.cmd vitest run tests/unit/use-scroll-boundaries.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/features/kits/use-scroll-boundaries.ts src/features/kits/components/kit-builder-panel.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/use-scroll-boundaries.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/visual-alignment-contract.test.ts
git commit -m "feat(kits): track inspector scroll edges"
```

---

### Task 2: Site-aligned Kit summary and administrative actions

**Files:**

- Modify: `src/features/kits/components/kit-builder-panel.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/unit/kit-builder-panel.test.tsx`
- Modify: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**

- Consumes the existing `CatalogKit`, `issueUrl`, `onDuplicate`, `onEdit`, and
  `onCopyLink` interfaces unchanged.
- Produces markup classes consumed by Task 3:
  - `.kit-builder-inspect-summary`
  - `.kit-builder-inspect-heading`
  - `.kit-builder-inspect-identity`
  - `.kit-builder-inspect-description`
  - `.kit-builder-panel-primary-actions`
  - `.kit-builder-panel-admin-actions`
  - `.kit-withdrawal-action`

- [ ] **Step 1: Replace the old markup expectations with failing summary/action tests**

Update the existing `separates the inspect header from its project list` test:

```tsx
test("renders a Kit-card-aligned inspect summary and accessible project list", () => {
  renderInspectPanel();

  const summary = document.querySelector(
    ".kit-builder-inspect-summary",
  );
  expect(summary).not.toBeNull();
  expect(summary?.querySelector("svg")).not.toBeNull();
  expect(
    within(summary as HTMLElement).getByRole("heading", {
      name: "Story Kit",
    }),
  ).toBeVisible();
  expect(within(summary as HTMLElement).getByText("@author")).toBeVisible();
  expect(
    within(summary as HTMLElement).getByText("4 Projects"),
  ).toHaveClass("kit-project-count-tag");
  expect(
    screen.getByRole("heading", { name: "Projects" }),
  ).toHaveClass("kit-project-list-heading");
  expect(screen.getByRole("list", { name: "Kit projects" })).toHaveClass(
    "kit-project-stack",
  );
});
```

Update the action-treatment test:

```tsx
test("maps every inspect action to a visible control treatment", () => {
  renderInspectPanel();

  for (const name of ["Duplicate", "Edit", "Copy link"]) {
    expect(screen.getByRole("button", { name })).toHaveClass(
      "control-secondary",
    );
  }
  expect(screen.getByRole("link", { name: "Report Kit" })).toHaveClass(
    "control-secondary",
  );
  expect(
    screen.getByRole("link", { name: "Request withdrawal" }),
  ).toHaveClass("control-secondary", "kit-withdrawal-action");
});
```

Retain the existing URL and copy-delegation assertions.

Add a mobile-preservation test:

```tsx
test("preserves the current phone inspect summary", () => {
  mockMatchMedia({ phone: true, touchLayout: true });
  render(
    <KitBuilderPanel
      state={{ mode: "inspect", collapsed: false, kitId: "story-kit-41" }}
      kit={fixtureKit()}
      now="2026-07-24T00:00:00.000Z"
      onCopyLink={() => undefined}
      onCollapse={() => undefined}
    />,
  );

  expect(
    document.querySelector(".kit-builder-inspect-heading"),
  ).toBeNull();
  expect(screen.getByRole("heading", { name: "Story Kit" })).toBeVisible();
  expect(screen.getByText("@author")).toBeVisible();
  expect(screen.getByRole("heading", { name: "4 Projects" })).toHaveClass(
    "kit-project-list-heading",
  );
  expect(document.querySelector(".kit-project-count-tag")).toBeNull();
});
```

Add this CSS contract to `visual-alignment-contract.test.ts`:

```ts
test("aligns the inspector summary and administrative controls", () => {
  const css = read("src/styles/catalog.css");

  expect(css).toMatch(
    /\.kit-builder-inspect-heading h2\s*\{[^}]*font-size:\s*17px[^}]*font-weight:\s*720[^}]*letter-spacing:\s*-0\.02em[^}]*line-height:\s*1\.3/s,
  );
  expect(css).toMatch(
    /\.kit-builder-inspect-identity small\s*\{[^}]*font-size:\s*10px[^}]*font-weight:\s*500/s,
  );
  expect(css).toMatch(
    /\.kit-builder-inspect-description\s*\{[^}]*overflow:\s*hidden[^}]*-webkit-line-clamp:\s*4/s,
  );
  expect(css).toMatch(
    /@media \(min-width:\s*761px\)[\s\S]*?\.kit-builder-inspect-description\s*\{[^}]*font-size:\s*11px[^}]*line-height:\s*1\.48/s,
  );
  expect(css).toMatch(
    /\.kit-builder-panel-primary-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
  );
  expect(css).toMatch(
    /\.kit-builder-panel-admin-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
  );
  expect(css).toMatch(
    /\.kit-withdrawal-action\s*\{[^}]*border-color:\s*var\(--color-danger-border\)[^}]*color:\s*var\(--color-danger-text\)/s,
  );
});
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder-panel.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because the summary classes/count tag are absent and the two
administrative links still use `control-quiet`.

- [ ] **Step 3: Implement the dedicated inspect summary**

Replace `.kit-builder-panel-inspect-header` contents with:

```tsx
<div className="kit-builder-panel-inspect-header">
  <section
    className="kit-builder-inspect-summary"
    aria-labelledby={`${kit.id}-inspect-title`}
  >
    {phone ? (
      <header>
        <h2 id={`${kit.id}-inspect-title`}>{kit.title}</h2>
        <p>@{kit.author.login}</p>
      </header>
    ) : (
      <header className="kit-builder-inspect-heading">
        <CategoryIcon name="kit" />
        <span className="kit-builder-inspect-identity">
          <h2 id={`${kit.id}-inspect-title`}>{kit.title}</h2>
          <small>@{kit.author.login}</small>
        </span>
        <b className="kit-project-count-tag">
          {kit.components.length}{" "}
          {kit.components.length === 1 ? "Project" : "Projects"}
        </b>
      </header>
    )}
    <p className="kit-builder-inspect-description">{kit.description}</p>
  </section>
  <div className="kit-builder-panel-actions">
    <div className="kit-builder-panel-primary-actions">
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
    </div>
    <div className="kit-builder-panel-admin-actions">
      <a
        className="control-secondary"
        href={issueUrl("06-kit-report.yml", kit)}
        target="_blank"
      >
        <CategoryIcon name="report" />
        Report Kit
      </a>
      <a
        className="control-secondary kit-withdrawal-action"
        href={issueUrl("07-kit-withdrawal.yml", kit)}
        target="_blank"
      >
        Request withdrawal
      </a>
    </div>
  </div>
</div>
```

Keep the existing Copy tooltip wrapper and all existing callbacks inside the
primary action group.

Change the project heading text without changing its association:

```tsx
<h3
  id={`${kit.id}-project-list-heading`}
  className="kit-project-list-heading"
>
  {phone
    ? `${kit.components.length} ${
        kit.components.length === 1 ? "Project" : "Projects"
      }`
    : "Projects"}
</h3>
```

- [ ] **Step 4: Implement summary typography and action layout**

Add:

```css
.kit-builder-inspect-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

@media (min-width: 761px) {
  .kit-builder-inspect-summary {
    display: grid;
    gap: 10px;
  }

  .kit-builder-inspect-heading {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
  }

  .kit-builder-inspect-heading > svg {
    width: 26px;
    height: 26px;
    color: var(--color-preset);
  }

  .kit-builder-inspect-identity {
    display: grid;
    min-width: 0;
  }

  .kit-builder-inspect-heading h2 {
    margin: 0;
    color: var(--color-text-primary);
    font-size: 17px;
    font-weight: 720;
    letter-spacing: -0.02em;
    line-height: 1.3;
  }

  .kit-builder-inspect-identity small {
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.3;
  }

  .kit-builder-inspect-description {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 11px;
    line-height: 1.48;
  }
}

.kit-builder-panel-actions {
  display: grid;
  gap: 8px;
  margin: 14px 0 0;
}

.kit-builder-panel-primary-actions,
.kit-builder-panel-admin-actions {
  display: grid;
  gap: 8px;
}

.kit-builder-panel-primary-actions {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.kit-builder-panel-primary-actions > .control-tooltip {
  display: grid;
  min-width: 0;
}

.kit-builder-panel-primary-actions > .control-tooltip > button {
  width: 100%;
}

.kit-builder-panel-admin-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.kit-builder-panel-actions button,
.kit-builder-panel-actions a {
  min-width: 0;
  min-height: 36px;
  justify-content: center;
  padding: 7px 8px;
  text-align: center;
}

.kit-withdrawal-action {
  border-color: var(--color-danger-border);
  color: var(--color-danger-text);
  background: transparent;
}

.kit-withdrawal-action:is(:hover, :focus-visible) {
  border-color: var(--color-danger);
  color: var(--color-danger-text);
  background: var(--color-danger-bg);
}

.kit-withdrawal-action:active {
  border-color: var(--color-danger);
  color: var(--color-text-inverse);
  background: var(--color-danger);
}
```

Remove the obsolete `.kit-builder-panel-inspect-header > p` clamp and broad
action flex rules that conflict with these dedicated classes.

In the phone media query, preserve the existing two-column/44px contract:

```css
.kit-builder-panel-primary-actions,
.kit-builder-panel-admin-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.kit-builder-panel-actions button,
.kit-builder-panel-actions a {
  min-height: 44px;
}
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder-panel.test.tsx tests/unit/kit-project-stack.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/features/kits/components/kit-builder-panel.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/kit-builder-panel.test.tsx tests/unit/visual-alignment-contract.test.ts
git commit -m "feat(kits): refine inspector summary actions"
```

---

### Task 3: Desktop scroll ownership, scrollbar, gutters, and geometry

**Files:**

- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/unit/visual-alignment-contract.test.ts`
- Modify: `tests/kits-e2e/kits.spec.ts`

**Interfaces:**

- Consumes Task 1's body frame, body data attributes, and fade elements.
- Consumes Task 2's summary and action classes.
- Preserves all public React props and catalog data shapes.

- [ ] **Step 1: Replace the obsolete nested-scroll CSS contract with a failing one-scroll contract**

Replace `gives desktop Kit inspection one bounded project scroll` in
`visual-alignment-contract.test.ts`:

```ts
test("gives desktop Kit inspection one narrow body scroll", () => {
  const css = read("src/styles/catalog.css");
  const responsive = read("src/styles/responsive.css");

  expect(css).toContain(
    "--kit-builder-expanded-width: clamp(280px, 22vw, 340px)",
  );
  expect(css).toMatch(
    /\.kit-builder-panel\s*\{[^}]*--kit-builder-content-inset:\s*12px[^}]*padding:\s*18px var\(--kit-builder-content-inset\)/s,
  );
  expect(css).toMatch(
    /\.kit-builder-panel\[data-mode="inspect"\] \.kit-builder-panel-body\s*\{[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/s,
  );
  expect(css).toMatch(
    /\.kit-project-stack\s*\{[^}]*padding:\s*0[^}]*overflow:\s*visible/s,
  );
  expect(css).toMatch(
    /\.kit-builder-panel\[data-mode="inspect"\] \.kit-builder-panel-body::-webkit-scrollbar\s*\{[^}]*width:\s*6px/s,
  );
  expect(css).toMatch(
    /\.kit-builder-scroll-fade\s*\{[^}]*pointer-events:\s*none/s,
  );
  expect(responsive).toMatch(
    /\.kit-builder-panel-body-frame\s*\{[^}]*width:\s*auto[^}]*min-width:\s*0/s,
  );
});
```

- [ ] **Step 2: Rewrite the large-stack browser test for one-scroll ownership**

Replace `scrolls a large desktop project stack under a fixed Kit header` with:

```ts
test("scrolls one desktop inspector body without a nested project scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await openKits(page);
  await page.getByRole("button", { name: "Open Large Stack" }).click();

  const panel = page.getByRole("complementary", { name: "Kit Builder" });
  const body = panel.locator(".kit-builder-panel-body");
  const stack = panel.locator(".kit-project-stack");
  const firstCard = stack.locator(".project-card").first();

  const geometry = await panel.evaluate((element) => {
    const body = element.querySelector<HTMLElement>(
      ".kit-builder-panel-body",
    );
    const stack = element.querySelector<HTMLElement>(".kit-project-stack");
    const card = stack?.querySelector<HTMLElement>(".project-card");
    if (!body || !stack || !card) {
      throw new Error("Kit inspector geometry is incomplete");
    }
    return {
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      cardWidth: card.getBoundingClientRect().width,
      panelWidth: element.getBoundingClientRect().width,
      stackClientHeight: stack.clientHeight,
      stackScrollHeight: stack.scrollHeight,
    };
  });

  expect(geometry.panelWidth).toBeCloseTo(316.8, 0);
  expect(geometry.cardWidth).toBeGreaterThanOrEqual(280);
  expect(geometry.bodyScrollHeight).toBeGreaterThan(
    geometry.bodyClientHeight,
  );
  expect(geometry.stackScrollHeight).toBe(geometry.stackClientHeight);
  await expect(firstCard).toBeVisible();

  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });

  await expect(
    stack.getByRole("link", { name: "Fixture Tool 49", exact: true }),
  ).toBeInViewport();
  await expect(
    stack.getByRole("group", {
      name: "Fixture Flagged Tool unavailable",
    }),
  ).toBeVisible();
  await expect(panel.locator(".kit-builder-panel-header")).toBeVisible();
  await expect(panel.locator(".kit-builder-panel-body-frame")).toHaveAttribute(
    "data-can-scroll-up",
    "true",
  );
  await expect(panel.locator(".kit-builder-panel-body-frame")).not.toHaveAttribute(
    "data-can-scroll-down",
  );
});
```

Update the 600-character description test to assert the new selector and
initial action reachability:

```ts
const description = panel.locator(".kit-builder-inspect-description");
await expect(description).toHaveCSS("-webkit-line-clamp", "4");
await expect(panel.getByRole("link", { name: "Report Kit" })).toBeInViewport();
await expect(
  panel.getByRole("link", { name: "Request withdrawal" }),
).toBeInViewport();
```

- [ ] **Step 3: Run RED CSS and browser proof**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts
npm.cmd run build:test-kits
$env:PORT='3001'; npm.cmd run test:kits-e2e -- --grep "600-character|one desktop inspector body"
```

Expected:

- CSS contract FAILS because the stack still owns scrolling and new selectors
  do not exist.
- Browser test FAILS because `stackScrollHeight > stackClientHeight`, the body
  does not scroll in inspect mode, and the card is below the 280px target.

- [ ] **Step 4: Implement frame sizing and one-scroll ownership**

In `catalog.css`, change the structural rules:

```css
.kit-builder-panel {
  --kit-builder-content-inset: 12px;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  align-self: start;
  min-width: 0;
  height: var(--kit-builder-visible-height, calc(100dvh - 116px));
  padding: 18px var(--kit-builder-content-inset);
  overflow: hidden;
  border-left: 1px solid var(--color-divider);
  background: var(--color-bg-surface-raised);
}

.kit-builder-panel-body-frame {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.kit-builder-panel-body {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.kit-builder-panel-header,
.kit-builder-panel-body-frame {
  width: calc(
    var(--kit-builder-expanded-width) - var(--kit-builder-content-inset) -
      var(--kit-builder-content-inset) - 1px
  );
  min-width: calc(
    var(--kit-builder-expanded-width) - var(--kit-builder-content-inset) -
      var(--kit-builder-content-inset) - 1px
  );
  align-self: flex-end;
}

.kit-builder-panel[data-mode="inspect"] .kit-builder-panel-body {
  padding-inline: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.kit-builder-panel-inspect {
  display: block;
  height: auto;
  min-height: 0;
}

.kit-project-list {
  display: grid;
  min-width: 0;
  margin-top: 18px;
  gap: 8px;
}

.kit-project-stack {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 12px;
  margin: 0;
  padding: 0;
  overflow: visible;
  list-style: none;
}
```

Delete the obsolete inspect-body `overflow: hidden`, the stack's
`overflow-x`, `overflow-y`, and `overscroll-behavior`, and the old
`grid-template-rows: auto minmax(0, 1fr)` constraints.

- [ ] **Step 5: Implement the scoped scrollbar and edge fades**

Add:

```css
.kit-builder-panel[data-mode="inspect"] .kit-builder-panel-body {
  scrollbar-color: var(--color-border-strong) transparent;
  scrollbar-width: thin;
}

.kit-builder-panel[data-mode="inspect"]
  .kit-builder-panel-body::-webkit-scrollbar {
  width: 6px;
}

.kit-builder-panel[data-mode="inspect"]
  .kit-builder-panel-body::-webkit-scrollbar-track {
  background: transparent;
}

.kit-builder-panel[data-mode="inspect"]
  .kit-builder-panel-body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--color-border-strong);
}

.kit-builder-panel[data-mode="inspect"]
  .kit-builder-panel-body::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-hover);
}

.kit-builder-scroll-fade {
  position: absolute;
  z-index: 2;
  right: 6px;
  left: 0;
  height: 16px;
  pointer-events: none;
}

.kit-builder-scroll-fade-top {
  top: 0;
  background: linear-gradient(
    to bottom,
    var(--color-bg-surface-raised),
    transparent
  );
}

.kit-builder-scroll-fade-bottom {
  bottom: 0;
  background: linear-gradient(
    to top,
    var(--color-bg-surface-raised),
    transparent
  );
}
```

Do not animate the scrollbar or fades.

- [ ] **Step 6: Preserve the phone scroll and fade contract**

Keep the frame width reset and 44px action rules established in Tasks 1 and 2.
In the existing `@media (max-width: 760px)` section, retain the current body
padding/scroll rules and hide desktop fades:

```css
.kit-builder-panel-body {
  padding: 16px calc(14px + env(safe-area-inset-right))
    calc(16px + env(safe-area-inset-bottom))
    calc(14px + env(safe-area-inset-left));
}

.kit-builder-panel[data-mode="inspect"] .kit-builder-panel-body {
  overflow-y: auto;
}

.kit-builder-scroll-fade {
  display: none;
}
```

The existing mobile `.kit-project-stack { overflow: visible; }` remains valid.

- [ ] **Step 7: Run focused GREEN verification**

Run:

```powershell
npx.cmd vitest run tests/unit/visual-alignment-contract.test.ts tests/unit/kit-builder-panel.test.tsx tests/unit/use-scroll-boundaries.test.tsx
npm.cmd run palette:audit
npm.cmd run build:test-kits
$env:PORT='3001'; npm.cmd run test:kits-e2e -- --grep "600-character|one desktop inspector body|phone inspectors"
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/styles/catalog.css src/styles/responsive.css tests/unit/visual-alignment-contract.test.ts tests/kits-e2e/kits.spec.ts
git commit -m "feat(kits): unify inspector scrolling"
```

---

### Task 4: Desktop and mobile visual proof

**Files:**

- Modify: `tests/kits-e2e/kits.visual.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts-snapshots/alpha-kit-inspector-win32.png`
- Modify: `tests/kits-e2e/kits.visual.spec.ts-snapshots/large-kit-inspector-scrolled-win32.png`
- Modify if pixels change only as allowed:
  - `tests/kits-e2e/kits.visual.spec.ts-snapshots/alpha-kit-inspector-390px-win32.png`
  - `tests/kits-e2e/kits.visual.spec.ts-snapshots/alpha-kit-inspector-320px-win32.png`
- Create:
  - `tests/kits-e2e/kits.visual.spec.ts-snapshots/kit-inspector-report-hover-win32.png`
  - `tests/kits-e2e/kits.visual.spec.ts-snapshots/kit-inspector-withdrawal-hover-win32.png`

**Interfaces:**

- Consumes the final selectors and scrolling behavior from Tasks 1–3.
- Produces visual baselines only; no production interfaces.

- [ ] **Step 1: Update the large-inspector visual to scroll the body**

Replace stack scrolling with:

```ts
const panel = page.getByRole("complementary", { name: "Kit Builder" });
const body = panel.locator(".kit-builder-panel-body");
await body.evaluate((element) => {
  element.scrollTop = element.scrollHeight;
  element.dispatchEvent(new Event("scroll"));
});
await expect(
  panel.getByRole("link", { name: "Fixture Tool 49", exact: true }),
).toBeInViewport();
await expect(panel).toHaveScreenshot("large-kit-inspector-scrolled.png", {
  animations: "disabled",
});
```

- [ ] **Step 2: Add administrative-control hover captures**

Add:

```ts
test("Kit inspector Report link has button affordance", async ({ page }) => {
  await openKits(page, { width: 1440, height: 800 });
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();

  const panel = page.getByRole("complementary", { name: "Kit Builder" });
  await panel.getByRole("link", { name: "Report Kit" }).hover();
  await expect(panel).toHaveScreenshot("kit-inspector-report-hover.png", {
    animations: "disabled",
  });
});

test("Kit inspector withdrawal link has restrained danger affordance", async ({
  page,
}) => {
  await openKits(page, { width: 1440, height: 800 });
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();

  const panel = page.getByRole("complementary", { name: "Kit Builder" });
  await panel.getByRole("link", { name: "Request withdrawal" }).hover();
  await expect(panel).toHaveScreenshot(
    "kit-inspector-withdrawal-hover.png",
    { animations: "disabled" },
  );
});
```

- [ ] **Step 3: Run visual tests to verify RED**

Run:

```powershell
npm.cmd run build:test-kits
$env:PORT='3001'; npm.cmd run test:kits-visual
```

Expected: existing desktop inspector baselines mismatch and the two new
baselines are missing. Mobile baselines either remain byte-identical or differ
only around the two administrative controls.

- [ ] **Step 4: Generate only the named inspector baselines**

Run:

```powershell
$env:PORT='3001'; npm.cmd run test:kits-visual -- --grep "Alpha Kit inspector|large Kit inspector|Report link|withdrawal link|phone inspector" --update-snapshots
```

Expected: only the approved inspector baseline files are written.

- [ ] **Step 5: Inspect every changed PNG**

Open each changed image and confirm:

- panel width is unchanged;
- no scrollbar begins beside the **Projects** heading;
- the remaining scrollbar is 6px, transparent-track, and at the panel edge;
- the top or bottom fade agrees with the actual scroll boundary;
- project cards are visibly wider;
- the summary uses compact Kit-card typography and a count tag;
- Report Kit is a neutral bordered button;
- Request withdrawal is restrained danger-outline, not a filled confirmation;
- the mobile layout remains intact at 390px and 320px.

Do not accept a baseline that clips a label, hides a project, changes the
mobile scroll structure, or widens the panel.

- [ ] **Step 6: Run the visual suite without update mode**

Run:

```powershell
$env:PORT='3001'; npm.cmd run test:kits-visual
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add tests/kits-e2e/kits.visual.spec.ts
git add -u tests/kits-e2e/kits.visual.spec.ts-snapshots
git add -f tests/kits-e2e/kits.visual.spec.ts-snapshots/kit-inspector-report-hover-win32.png tests/kits-e2e/kits.visual.spec.ts-snapshots/kit-inspector-withdrawal-hover-win32.png
git commit -m "test(kits): prove inspector scroll polish"
```

---

### Task 5: Full verification and stale-contract audit

**Files:**

- Verify only unless a failing task-scoped check requires a focused fix.

**Interfaces:**

- Consumes the complete implementation.
- Produces final verification evidence and no new runtime API.

- [ ] **Step 1: Build the static Kit fixture**

Run:

```powershell
npm.cmd run build:test-kits
```

Expected: exit 0.

- [ ] **Step 2: Run all focused unit tests**

Run:

```powershell
npx.cmd vitest run tests/unit/use-scroll-boundaries.test.tsx tests/unit/kit-builder-panel.test.tsx tests/unit/kit-project-stack.test.tsx tests/unit/visual-alignment-contract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run Kit browser suites sequentially**

Run:

```powershell
$env:PORT='3001'; npm.cmd run test:kits-e2e
$env:PORT='3001'; npm.cmd run test:kits-visual
```

Expected: PASS.

Do not run `npm.cmd run check` in parallel with these suites: the repository
gate rebuilds the shared static output and can invalidate the served Kit
fixture during Playwright execution.

- [ ] **Step 4: Run the repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
unit tests, production build, and static-export verification all PASS.

- [ ] **Step 5: Audit forbidden or stale contracts**

Run:

```powershell
rg -n "kit-project-stack[^}]*overflow-y|kit-builder-panel\\[data-mode=\"inspect\"\\][^{]*\\.kit-builder-panel-body[^}]*overflow:\\s*hidden|control-quiet.*Report|control-quiet.*withdrawal" src tests
```

Expected: no production nested-stack overflow, no hidden inspect body, and no
quiet administrative Kit actions.

Run:

```powershell
rg -n -- "--kit-builder-expanded-width" src/styles/catalog.css src/styles/responsive.css
```

Expected: the pre-existing desktop and intermediate-width panel clamps are
unchanged.

- [ ] **Step 6: Review final diff and working tree**

Run:

```powershell
git diff --check
git status --short
git diff --stat HEAD~4..HEAD
git diff HEAD~4..HEAD -- src/features/kits src/styles tests/unit tests/kits-e2e
```

Confirm:

- no project-card composition was copied;
- no panel-width clamp changed;
- no mobile structure or scroll owner changed;
- body boundary observers clean up listeners and observers;
- issue URLs and canonical project URLs are unchanged;
- only approved visual baselines changed;
- no unrelated catalog-refresh files are included.

## Completion Evidence

The implementation handoff must report:

- final commit IDs;
- focused unit-test file and assertion counts;
- Kit E2E pass count;
- Kit visual pass count;
- repository gate result;
- exact changed screenshot names and visual-inspection confirmation;
- measured desktop panel width and project-card width;
- confirmation that `.kit-builder-panel-body` is the sole internal desktop
  inspector scroll owner;
- confirmation that 390px and 320px mobile behavior remains intact;
- any deferred non-blocking findings.
