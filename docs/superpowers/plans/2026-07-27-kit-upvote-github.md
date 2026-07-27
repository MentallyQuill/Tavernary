# Kit Upvote on GitHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom-right **Upvote on GitHub** link to every published Kit card using the exact visual treatment of the project-card plus control.

**Architecture:** A focused `KitUpvoteControl` derives the canonical GitHub issue URL from the existing `sourceIssueNumber` and renders a normal external link inside the existing tooltip primitive. It deliberately reuses `project-kit-control` and `project-kit-control-face`, so its 44-pixel target, 28-pixel face, dark glyph, orange background, and interaction states come from the same production CSS as the plus control. The existing GitHub reaction refresh, support snapshots, Trending calculation, and deployment workflow remain unchanged.

**Tech Stack:** React 19, TypeScript 6, Next.js 16 static export, CSS, Vitest, Testing Library, Playwright.

## Global Constraints

- The tooltip and accessible name must be exactly **Upvote on GitHub**.
- The link must open `https://github.com/MentallyQuill/Tavernary/issues/{sourceIssueNumber}` in a new tab.
- The link must use `rel="noopener noreferrer"`.
- The control must not claim the current visitor has voted and must not use `aria-pressed`.
- The outer target must be 44 by 44 pixels; the visible face must be 28 by 28 pixels.
- The arrow must use the supplied path `M4 14h4v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7h4a1.001 1.001 0 0 0 .781-1.625l-8-10c-.381-.475-1.181-.475-1.562 0l-8 10A1.001 1.001 0 0 0 4 14z`.
- The SVG must use `currentColor`; do not copy its hard-coded black fill, 800-pixel dimensions, XML declaration, or provenance comment.
- The supporter count stays in the existing metadata row.
- Do not modify reaction collection, schemas, canonical Kit records, Trending calculations, GitHub workflows, or generated catalog shape.
- Preserve unrelated working-tree changes.

---

## File Structure

- Create `src/features/kits/components/kit-upvote-control.tsx`: own URL derivation, tooltip copy, safe external-link attributes, and the up-arrow SVG.
- Modify `src/features/kits/components/kit-card.tsx`: compose the upvote control into each Kit card without changing card selection or the existing Copy and Report actions.
- Modify `src/styles/catalog.css`: position the control and reserve footer space while reusing the existing plus-control visual classes.
- Modify `tests/unit/kit-card.test.tsx`: prove URL, semantics, SVG contract, tooltip, and event isolation.
- Modify `tests/unit/visual-alignment-contract.test.ts`: lock the bottom-right geometry and shared plus-control classes.
- Modify `tests/kits-e2e/kits.spec.ts`: compare rendered upvote and plus geometry/styles and prove mobile target size.
- Modify `tests/kits-e2e/kits.visual.spec.ts`: add focused upvote tooltip proof and update affected Kit-card baselines.
- Update affected PNGs under `tests/kits-e2e/kits.visual.spec.ts-snapshots/`: record the approved rendered card layout.

---

### Task 1: Add the semantic GitHub upvote control

**Files:**

- Create: `src/features/kits/components/kit-upvote-control.tsx`
- Modify: `src/features/kits/components/kit-card.tsx`
- Test: `tests/unit/kit-card.test.tsx`

**Interfaces:**

- Consumes: `CatalogKit.sourceIssueNumber: number`, `Tooltip`, and the existing `project-kit-control` / `project-kit-control-face` CSS classes.
- Produces: `kitUpvoteUrl(sourceIssueNumber: number): string` and `KitUpvoteControl({ sourceIssueNumber }: { sourceIssueNumber: number }): JSX.Element`.

- [ ] **Step 1: Write the failing semantic and event-isolation test**

Add this test inside `describe("Kit card", ...)` in
`tests/unit/kit-card.test.tsx`:

```tsx
test("links the upvote arrow to the canonical GitHub issue without selecting the Kit", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <KitCard
      kit={kit({ sourceIssueNumber: 241 })}
      now="2026-07-24T00:00:00.000Z"
      selected={false}
      onSelect={onSelect}
      onCopyLink={() => undefined}
      onReport={() => undefined}
    />,
  );

  const upvote = screen.getByRole("link", { name: "Upvote on GitHub" });
  expect(upvote).toHaveAttribute(
    "href",
    "https://github.com/MentallyQuill/Tavernary/issues/241",
  );
  expect(upvote).toHaveAttribute("target", "_blank");
  expect(upvote).toHaveAttribute("rel", "noopener noreferrer");
  expect(upvote).not.toHaveAttribute("aria-pressed");
  expect(upvote).toHaveClass("project-kit-control", "kit-upvote-control");

  const glyph = upvote.querySelector('[data-kit-glyph="upvote"]');
  expect(glyph).toHaveAttribute("viewBox", "0 0 24 24");
  expect(glyph).toHaveAttribute("fill", "currentColor");
  expect(glyph?.querySelector("path")).toHaveAttribute(
    "d",
    "M4 14h4v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7h4a1.001 1.001 0 0 0 .781-1.625l-8-10c-.381-.475-1.181-.475-1.562 0l-8 10A1.001 1.001 0 0 0 4 14z",
  );

  await user.click(upvote);
  expect(onSelect).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Extend the tooltip test**

After the existing Report tooltip assertion in
`tests/unit/kit-card.test.tsx`, add:

```tsx
const upvote = screen.getByRole("link", { name: "Upvote on GitHub" });
await user.hover(upvote);
expect(
  screen.getByRole("tooltip", { name: "Upvote on GitHub" }),
).toBeVisible();
```

- [ ] **Step 3: Run the focused unit test and verify the red state**

Run:

```powershell
npm.cmd test -- tests/unit/kit-card.test.tsx
```

Expected: FAIL because no **Upvote on GitHub** link exists.

- [ ] **Step 4: Create the minimal upvote component**

Create `src/features/kits/components/kit-upvote-control.tsx`:

```tsx
import { useId } from "react";

import { Tooltip } from "@/components/ui/tooltip";

const UPVOTE_PATH =
  "M4 14h4v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7h4a1.001 1.001 0 0 0 .781-1.625l-8-10c-.381-.475-1.181-.475-1.562 0l-8 10A1.001 1.001 0 0 0 4 14z";

export function kitUpvoteUrl(sourceIssueNumber: number) {
  return `https://github.com/MentallyQuill/Tavernary/issues/${sourceIssueNumber}`;
}

export function KitUpvoteControl({
  sourceIssueNumber,
}: {
  sourceIssueNumber: number;
}) {
  const tooltipId = useId();

  return (
    <Tooltip
      id={`${tooltipId}-kit-upvote-tooltip`}
      label="Upvote on GitHub"
      className="control-tooltip"
    >
      <a
        className="project-kit-control kit-upvote-control"
        href={kitUpvoteUrl(sourceIssueNumber)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Upvote on GitHub"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="project-kit-control-face" aria-hidden="true">
          <svg
            data-kit-glyph="upvote"
            viewBox="0 0 24 24"
            fill="currentColor"
            focusable="false"
          >
            <path d={UPVOTE_PATH} />
          </svg>
        </span>
      </a>
    </Tooltip>
  );
}
```

- [ ] **Step 5: Compose the control into the Kit card**

In `src/features/kits/components/kit-card.tsx`, import
`KitUpvoteControl`:

```tsx
import { KitUpvoteControl } from "./kit-upvote-control";
```

Immediately after the existing `.kit-card-actions` block and before the
closing `</article>`, render:

```tsx
<span className="kit-upvote-control-hit">
  <KitUpvoteControl sourceIssueNumber={kit.sourceIssueNumber} />
</span>
```

Do not add an upvote callback to `KitGrid` or `CatalogPage`; the control is a
normal link derived from data already present on `CatalogKit`.

- [ ] **Step 6: Run the focused unit test and verify the green state**

Run:

```powershell
npm.cmd test -- tests/unit/kit-card.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the semantic control**

```powershell
git add -- src/features/kits/components/kit-upvote-control.tsx src/features/kits/components/kit-card.tsx tests/unit/kit-card.test.tsx
git commit -m "feat(kits): add GitHub upvote link"
```

---

### Task 2: Lock the plus-matched card geometry

**Files:**

- Modify: `src/styles/catalog.css`
- Test: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**

- Consumes: `.project-kit-control` and `.project-kit-control-face` from the existing project-card Kit-membership control.
- Produces: `.kit-upvote-control-hit`, relative Kit-card positioning, and a 40-pixel Kit footer gutter.

- [ ] **Step 1: Write the failing CSS contract**

Add a focused test to `tests/unit/visual-alignment-contract.test.ts`:

```ts
test("positions the Kit upvote in the plus control's bottom-right frame", () => {
  const css = read("src/styles/catalog.css");

  expect(css).toMatch(
    /\.kit-card\s*\{[^}]*position:\s*relative[^}]*display:\s*grid/s,
  );
  expect(css).toMatch(
    /\.kit-upvote-control-hit\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*4px[^}]*right:\s*4px[^}]*width:\s*44px[^}]*height:\s*44px[^}]*place-items:\s*center/s,
  );
  expect(css).toMatch(
    /\.kit-card-actions\s*\{[^}]*padding-right:\s*40px[^}]*padding-top:\s*10px/s,
  );
});
```

- [ ] **Step 2: Run the CSS contract and verify the red state**

Run:

```powershell
npm.cmd test -- tests/unit/visual-alignment-contract.test.ts
```

Expected: FAIL because `.kit-upvote-control-hit` and the Kit footer gutter do
not exist.

- [ ] **Step 3: Add only the positioning styles**

In `src/styles/catalog.css`, add `position: relative` before `display: grid` in
the existing `.kit-card` rule:

```css
.kit-card {
  position: relative;
  display: grid;
```

Add the upvote frame near the existing Kit-card action styles:

```css
.kit-upvote-control-hit {
  position: absolute;
  z-index: 4;
  right: 4px;
  bottom: 4px;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
}
```

Update the existing `.kit-card-actions` rule:

```css
.kit-card-actions {
  padding-top: 10px;
  padding-right: 40px;
  border-top: 1px solid var(--color-border-default);
}
```

Do not duplicate face colors or interaction states. The link already uses
`.project-kit-control` and `.project-kit-control-face`, including
`--color-action-primary-text` for the dark glyph and
`--color-action-primary-bg` for the orange face.

- [ ] **Step 4: Run the focused unit contracts**

Run:

```powershell
npm.cmd test -- tests/unit/kit-card.test.tsx tests/unit/visual-alignment-contract.test.ts tests/unit/project-card.test.tsx
```

Expected: PASS, including the existing plus-control contract.

- [ ] **Step 5: Run the palette audit**

Run:

```powershell
npm.cmd run palette:audit
```

Expected: PASS with no new color literals.

- [ ] **Step 6: Commit the shared geometry**

```powershell
git add -- src/styles/catalog.css tests/unit/visual-alignment-contract.test.ts
git commit -m "style(kits): match upvote to card control"
```

---

### Task 3: Prove rendered parity, accessibility, and layout

**Files:**

- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts`
- Update: `tests/kits-e2e/kits.visual.spec.ts-snapshots/*.png`

**Interfaces:**

- Consumes: rendered `.kit-upvote-control`, `.project-kit-control`, and `.project-kit-control-face`.
- Produces: static-export proof for URL semantics, exact plus/upvote geometry, dark glyph parity, tooltip treatment, mobile sizing, and non-overlapping Kit-card layout.

- [ ] **Step 1: Add the rendered parity test**

Add this test to `tests/kits-e2e/kits.spec.ts`:

```ts
test("Kit upvote matches the project-card plus control and links the source issue", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKits(page);

  const card = page.getByRole("article", { name: "Alpha Kit" });
  const upvote = card.getByRole("link", { name: "Upvote on GitHub" });
  await expect(upvote).toHaveAttribute(
    "href",
    "https://github.com/MentallyQuill/Tavernary/issues/101",
  );
  await expect(upvote).toHaveAttribute("target", "_blank");
  await expect(upvote).toHaveAttribute("rel", "noopener noreferrer");

  const upvoteFace = upvote.locator(".project-kit-control-face");
  const upvoteStyle = await upvoteFace.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: bounds.width,
      height: bounds.height,
      color: style.color,
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
    };
  });

  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  const add = page.locator(".project-kit-control").first();
  const addFace = add.locator(".project-kit-control-face");
  const addStyle = await addFace.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: bounds.width,
      height: bounds.height,
      color: style.color,
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
    };
  });

  expect(upvoteStyle).toEqual(addStyle);
  expect(upvoteStyle).toMatchObject({
    width: 28,
    height: 28,
    color: "rgb(22, 16, 8)",
  });
});
```

- [ ] **Step 2: Extend the mobile target test**

In the existing mobile target test near the end of
`tests/kits-e2e/kits.spec.ts`, add:

```ts
await expectMobileTarget(
  alphaCard.getByRole("link", { name: "Upvote on GitHub" }),
);
```

Also assert that the card has no horizontal overflow:

```ts
expect(
  await alphaCard.evaluate(
    (element) => element.scrollWidth <= element.clientWidth,
  ),
).toBe(true);
```

- [ ] **Step 3: Add focused tooltip visual proof**

Add this test after the existing Kit-card Report hover test in
`tests/kits-e2e/kits.visual.spec.ts`:

```ts
test("Kit card Upvote on GitHub hover matches the card-control treatment", async ({
  page,
}) => {
  await openKits(page, { width: 1440, height: 900 });

  const card = page.getByRole("article", { name: "Alpha Kit" });
  await card.getByRole("link", { name: "Upvote on GitHub" }).hover();
  const tooltip = page.getByRole("tooltip", { name: "Upvote on GitHub" });
  await expect(tooltip).toBeVisible();
  await expect(card).toHaveScreenshot("kit-card-upvote-hover.png", {
    animations: "disabled",
  });
});
```

- [ ] **Step 4: Build the current static Kit fixture**

Run:

```powershell
npm.cmd run build:test-kits
```

Expected: the fixture static export completes successfully.

- [ ] **Step 5: Run rendered behavior tests before changing baselines**

Run:

```powershell
npm.cmd run test:kits-e2e
```

Expected: PASS. If the parity test fails, fix production geometry rather than
weakening the equality assertion.

- [ ] **Step 6: Confirm the visual suite detects the intentional card change**

Run:

```powershell
npm.cmd run test:kits-visual
```

Expected: FAIL only for Kit-card screenshots affected by the new bottom-right
control and for the new missing `kit-card-upvote-hover.png` baseline.

- [ ] **Step 7: Regenerate and inspect the affected baselines**

Run:

```powershell
npm.cmd run test:kits-visual -- --update-snapshots
```

Inspect the generated PNGs and confirm:

- the arrow and plus use the same dark glyph color;
- the arrow face matches the plus face;
- the control sits four pixels from the card's bottom-right motion frame;
- Copy and Report do not overlap the 44-pixel target;
- supported and support-unavailable cards remain aligned;
- no desktop or mobile content is clipped.

- [ ] **Step 8: Re-run the visual suite without update mode**

Run:

```powershell
npm.cmd run test:kits-visual
```

Expected: PASS.

- [ ] **Step 9: Run formatting, focused tests, and the full repository gate**

Run:

```powershell
npm.cmd run format
npm.cmd test -- tests/unit/kit-card.test.tsx tests/unit/visual-alignment-contract.test.ts tests/unit/project-card.test.tsx
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
npm.cmd run check
```

Expected: every command passes. Review `git status --short` after formatting and
ensure only planned implementation, tests, and snapshot files are staged.

- [ ] **Step 10: Commit rendered proof**

```powershell
git add -- tests/kits-e2e/kits.spec.ts tests/kits-e2e/kits.visual.spec.ts tests/kits-e2e/kits.visual.spec.ts-snapshots
git commit -m "test(kits): prove GitHub upvote control"
```

---

## Completion Criteria

- Every published Kit card has an **Upvote on GitHub** link.
- The link opens the Kit's canonical source issue in a new tab.
- The arrow uses the supplied SVG path and the plus glyph's dark
  `currentColor`.
- The upvote and plus controls share the same production face and interaction
  CSS.
- The upvote occupies the same 44-pixel target and 28-pixel face at the same
  bottom-right offset.
- The existing supporter count and automated GitHub reaction pipeline are
  unchanged.
- Focused unit, browser, mobile, visual, palette, and full repository checks
  pass.
