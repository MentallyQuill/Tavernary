# Main Page and Kit Builder Fixes Progress Tracker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the reported main-page project-card and Kit Builder interaction, layout, drag, scrolling, hierarchy, sizing, and desktop-contrast regressions.

**Architecture:** Preserve the approved static-first Kits architecture and existing project-selection flow. Fix state transitions at their source, keep composite controls inside one motion coordinate system, make the desktop builder height track its actual visible viewport space, and express visual hierarchy through the existing Tavernary tokens.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest, Testing Library, and Playwright.

## Global Constraints

- A project-card plus/minus action must never open or close the Kit Builder.
- Project selection must preserve the current Kit Builder open/collapsed state.
- The project link and its Kit control remain separate accessible interactive elements.
- Compact cards remain compact; the license remains hidden at compact density.
- The Frontend remains pinned outside the ordered Extensions & Presets stack.
- All controls retain keyboard access, visible focus, reduced-motion support, and a minimum 44-by-44-pixel interactive target where the responsive contract requires it.
- Orange-filled controls use `var(--color-page)` for high-contrast dark text or icons.
- No backend, account, OAuth, or runtime API work is in scope.

---

## Status

| Area | State | Proof required |
| --- | --- | --- |
| Builder state preservation | Complete | Unit and desktop/mobile browser tests |
| Card/control shared animation | Complete | Interaction test and desktop visual snapshot |
| Builder viewport scrolling | Complete | Geometry test and long-stack browser test |
| Builder section hierarchy | Complete | Component test and visual snapshot |
| Builder toggle sizing | Complete | Computed-style browser assertion |
| Drag pointer alignment | Complete | Drag geometry unit test and browser drag test |
| Compact card control layout | Complete | Unit, browser, and responsive visual tests |
| Desktop filled-control contrast | Complete | Palette/contrast assertions and visual snapshots |
| Full verification | Blocked | Requested UI suites pass; unrelated baseline failures are recorded below |

Update each row to **In progress**, **Blocked**, or **Complete** as work advances. A row is Complete only after its listed proof passes.

## Fix 1: Preserve Kit Builder State When Selecting a Card

### Observed behavior

The first plus click can collapse an open Kit Builder. The control should only change project-selection state.

### Root cause

`useKitBuilder.startSelectionDraft()` creates the implicit draft with `collapsed: true`, discarding the builder’s current open/collapsed state.

### Implementation contract

- Starting an implicit draft preserves `state.collapsed`.
- An open builder stays open after the first selection.
- A collapsed builder stays collapsed after the first selection.
- Selecting or deselecting later cards also leaves builder visibility unchanged.
- Applying or cancelling the selection does not steal focus, change the query, or move page scroll.

### Progress

- [x] Add failing state-hook tests for initially open and initially collapsed builders.
- [x] Add a failing catalog integration test proving the first plus click does not change builder visibility.
- [x] Preserve the current collapsed value when creating the implicit draft.
- [x] Run focused unit tests.
- [x] Add desktop and mobile browser coverage for the complete select/apply/cancel flow.

## Fix 2: Move the Plus/Minus Control With Its Card

### Observed behavior

The card rises on hover/focus/press while the plus/minus control appears to float independently.

### Root cause

Motion transforms are applied to `.project-card`, while `.project-kit-control-hit` is an absolutely positioned sibling anchored to the unmoving `.project-card-shell`.

### Implementation contract

- Translation and press-scale motion occur on the shared card shell.
- The card link, plus/minus control, and “In Kit” badge remain visually locked together.
- Border, background, and focus styling can remain on their semantic child elements.
- No nested interactive elements are introduced.
- Reduced-motion mode removes the shared movement without changing state styling.

### Progress

- [x] Add a failing style/interaction contract showing the shell owns movement.
- [x] Move hover, focus, and active transforms to the card shell.
- [x] Remove conflicting child transforms.
- [x] Verify plus/minus alignment before, during, and after hover and press.
- [x] Refresh the affected desktop visual snapshots.

## Fix 3: Keep the Entire Builder Stack Reachable

### Observed behavior

Projects added to a long Kit extend below the browser’s bottom edge, and the final rows and submit area cannot always be reached.

### Root cause

The desktop panel is `100dvh` tall even when its initial top is below the site header and category navigation. Its actual bottom can therefore extend beyond the viewport before the page chrome has scrolled away.

### Implementation contract

- The builder’s bottom edge never exceeds the visible viewport.
- Its available height is `window.innerHeight` minus the panel’s current non-negative top offset.
- Height is recomputed on scroll and resize; once the panel reaches `top: 0`, it may use the full viewport height.
- `.kit-builder-panel-body` remains the only vertical scroll container.
- The last project row, project count, and Submit Kit button can be scrolled fully into view.
- Mobile continues using its existing full-height sheet behavior.

### Progress

- [x] Add a failing viewport-geometry browser test at the top of the page.
- [x] Add a failing long-stack test that scrolls the builder body to its final controls.
- [x] Introduce a focused viewport-height measurement for the desktop/tablet panel.
- [x] Recompute the available height on scroll and resize without layout thrashing.
- [x] Verify the panel both before and after the page header scrolls away.

## Fix 4: Make the Builder’s Two Composition Sections Explicit

### Observed behavior

The Frontend appears merely spaced away from the other rows, so the pinned single-Frontend rule can look like a layout defect.

### Implementation contract

- Keep the existing `Frontend` heading.
- Give both the populated Frontend row and the `Choose one Frontend` stand-in a border using `var(--color-kind-frontend)`.
- Add an `Extensions & Presets` heading immediately above the ordered stack.
- The new heading uses the same typographic hierarchy as `Frontend`.
- Screen-reader structure exposes two named regions: `Frontend` and `Extensions & Presets`.
- Empty, populated, dragging, and invalid-drop states retain an understandable border hierarchy.

### Progress

- [x] Add failing component assertions for the two named sections.
- [x] Wrap and label the ordered stack as Extensions & Presets.
- [x] Apply the Frontend-red border to populated and empty Frontend slots.
- [x] Reconcile drag/drop outlines so they remain visible over the semantic border.
- [x] Refresh builder visual snapshots with empty and populated Frontend states.

## Fix 5: Match the Kit Builder Open and Close Controls

### Observed behavior

The visible open and close controls use different heights, making the rail and expanded header feel like separate control systems.

### Implementation contract

- Desktop open and close icon faces are both 36-by-36 pixels.
- Both use the same Kit Builder icon, border treatment, foreground color, and 26-by-26-pixel SVG.
- Direction alone distinguishes the actions: left points open; right points closed.
- Accessible names remain `Open Kit Builder…` and `Collapse Kit Builder`.
- Mobile retains its 44-by-44-pixel close target.

### Progress

- [x] Add a failing browser assertion comparing desktop open/close computed dimensions.
- [x] Create one shared desktop builder-toggle style.
- [x] Preserve draft count/status copy in the collapsed rail.
- [x] Verify hover, focus, pressed, and reduced-motion states.

## Fix 6: Anchor Dragging at the Handle Center

### Observed behavior

Beginning a drag snaps the pointer to the dragged card’s upper-left corner.

### Root cause

The drag ghost is translated directly to `pointer.clientX/clientY`, treating the pointer as the ghost’s top-left origin.

### Implementation contract

- Capture the drag handle’s center relative to the source row when the drag crosses its threshold.
- Translate the ghost so the pointer aligns with that handle-center position.
- Render the handle affordance in the ghost so the pointer relationship is visible.
- Preserve the offset through reorder, remove, cancellation, and autoscroll movement.
- Keyboard reordering remains unchanged.

### Progress

- [x] Add a failing geometry test for pointer-to-handle offset.
- [x] Extend drag state with the calculated ghost offset.
- [x] Render the drag ghost with the shared handle geometry.
- [x] Apply the offset when positioning the ghost.
- [x] Extend the browser drag test to assert pointer alignment and final order.

## Fix 7: Swap License and Kit Control Positions

### Observed behavior

At compact density, the left-side plus/minus control collides with project titles and summaries.

### Implementation contract

- Standard cards place the license at the lower left and the plus/minus Kit control at the lower right.
- Standard card chips retain the remaining footer space without colliding with either edge control.
- Compact cards continue hiding license and chips.
- Compact plus/minus controls remain at the right edge.
- Compact title and summary rows reserve the control gutter and ellipsize before reaching it.
- Long unbroken titles and summaries cannot render beneath the control.
- The layout works at desktop, tablet, and 320-pixel mobile widths.

### Progress

- [x] Add failing component/style tests for footer order and right-side control placement.
- [x] Add failing browser coverage using long title and summary fixtures.
- [x] Reorder the standard footer content and move the Kit control hit target right.
- [x] Add a compact right-side content gutter and explicit ellipsis constraints.
- [x] Refresh standard, compact, tablet, and 320-pixel visual snapshots.

## Fix 8: Adopt Mobile’s Dark Foreground on Desktop Filled Controls

### Observed behavior

Mobile’s orange-filled controls have clearer contrast because their text and icons are dark. Similar desktop controls are visually less consistent.

### Implementation contract

- Orange-filled desktop primary buttons, card plus/minus faces, and builder remove faces use `var(--color-page)` for text and icons.
- Descendant SVGs and glyphs inherit the foreground through `currentColor`.
- Hover, focus, pressed, selected, and enabled states retain the dark foreground.
- Disabled controls retain their muted disabled treatment instead of appearing actionable.
- Outline, quiet, Frontend-red, and destructive semantics are not recolored indiscriminately.

### Progress

- [x] Add failing style assertions for each filled-control family and state.
- [x] Consolidate the shared dark foreground rule.
- [x] Correct any child glyph or SVG rule that overrides inherited color.
- [x] Run the palette audit.
- [x] Refresh affected desktop visual snapshots and compare them with mobile.

## Expected File Map

- Modify `src/features/kits/use-kit-builder.ts` for visibility-state preservation.
- Modify `src/features/kits/use-project-stack-drag.ts` for drag ghost offset data.
- Modify `src/features/kits/components/kit-builder.tsx` for the second section and drag ghost structure.
- Modify `src/features/kits/components/kit-frontend-slot.tsx` only if section/drop semantics require a component-level state hook.
- Modify `src/features/kits/components/kit-builder-panel.tsx` for visible-height measurement and shared toggle structure.
- Modify `src/features/catalog/components/project-card.tsx` for standard footer order if CSS ordering alone would harm semantic order.
- Modify `src/styles/catalog.css` for desktop layout, animation ownership, control placement, hierarchy, sizing, and contrast.
- Modify `src/styles/responsive.css` only for breakpoint-specific compact/control behavior.
- Modify focused tests under `tests/unit`, `tests/e2e`, and `tests/kits-e2e`.
- Update only visual snapshots whose intended rendering changes.

## Verification Checklist

- [x] Every behavioral fix has a regression test that was observed failing before its implementation.
- [x] Focused unit tests pass (92/92).
- [x] Kit E2E tests pass at desktop, tablet, mobile, and 320-pixel widths (16/16).
- [x] Long-stack scrolling reaches the final row and submit controls.
- [x] Pointer dragging begins with the pointer centered on the handle affordance.
- [x] Compact long-title and long-summary fixtures ellipsize before the right-side plus/minus control.
- [x] Open/close control dimensions match on desktop.
- [x] Palette and contrast checks pass.
- [x] Reduced-motion coverage passes.
- [ ] `npm.cmd run check` is blocked at 481/482 unit tests by the pre-existing `refresh-github-workflow-safety` mismatch: the test expects “Advance baseline queue” while the workflow says “Drain baseline queue.”
- [ ] `npm.cmd run test:e2e` reaches 33/35; its two unrelated baseline failures expect the stale 209-project count and Kit fixture records from the production export.
- [x] `npm.cmd run test:kits-e2e` passes (16/16).
- [x] `npm.cmd run test:visual` passes after review (10/10).
- [x] `npm.cmd run test:kits-visual` passes with reviewed snapshots (10/10).
