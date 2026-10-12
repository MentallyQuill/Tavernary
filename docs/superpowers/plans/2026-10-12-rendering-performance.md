# Rendering Performance Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent tasks below, with TDD and whole-branch review before the approved PR and merge.

**Goal:** Make catalog and Kit Builder interactions smoother by eliminating repeated catalog work and unnecessary per-event layout/render updates.

**Architecture:** Retain React/Next static export and current catalog-core behavior. Resize desktop grid tracks once and animate panel content using transform/opacity; restore the mobile sheet transition. Reuse immutable catalog facts and memoize stable card content; coalesce geometry work to animation frames with cleanup.

**Tech Stack:** Locked Next 16.3.8/React 19.3, TypeScript, Vitest, Playwright, static GitHub Pages export.

**Scope:** The user prioritized scrolling and animations and approved these enhancements, PR creation, and merge. The investigation identified animated grid-track layout, repeated catalog matching, and unbatched geometry reads as targets; a framework migration remains a separate decision.

## Global Constraints

- Preserve catalog selection, frontend replacement, 50-project limit, ordering, drafts, query URLs, history, and static hosting.
- Preserve touch/keyboard activation, focus return, Escape/outside dismissal, collision handling, and prefers-reduced-motion.
- No Svelte migration, new product dependencies, pagination, or virtualization in this PR.
- Read installed Next documentation before code changes; preserve unrelated original-checkout edits.
- Use GitHub CLI with network permission for GitHub operations. User has authorized PR creation and merge.
- Independent workers own disjoint source/test files; integration, builds, commits, and GitHub operations belong to the coordinator.

## Review Focus

- A pending drag movement followed immediately by pointerup/cancel must not commit a stale target or leave callbacks running.
- Popover close/unmount and hidden anchors must cancel positioning frames; viewport/scroll changes must retain valid collision placement.
- Switching phone/desktop and repeated panel expansion must preserve focus, viewport fit, and reduced motion.
- Replacing catalog input must refresh shared lookup/filter facts; empty/full drafts and replacement frontends must retain exact rules.
- Search/filter/selection changes must reach memoized cards and controls without stale closures or inaccessible hidden state.

### Task 1: Panel motion and stable height

**Ownership:** src/styles/catalog.css, src/styles/responsive.css, src/features/kits/components/kit-builder-panel.tsx; tests/unit/kit-builder-opening-motion.test.ts, tests/unit/kit-builder-panel.test.tsx, tests/kits-e2e/kit-builder-opening.spec.ts, and a focused panel browser regression if necessary.

**Interfaces:** Retain KitBuilderPanel props and existing motion phase/duration contract. No shared interfaces produced.

- [x] Add one meaningful regression at a time and observe the expected failure for mobile interpolation, grid interpolation removal, or repeated unchanged height writes.
- [x] Make desktop track resizing discrete, with a short transform/opacity reveal of final-width panel content; ensure the global reduced-motion rules disable motion. Retain appropriate final geometry on desktop/tablet/phone.
- [x] Apply the existing transform transition to the phone builder sheet and retain presence dismissal timing.
- [x] Avoid rewriting --kit-builder-visible-height when unchanged; retain passive/rAF scroll handling and cancellation.
- [x] Run focused unit tests and report exact commands/results. Browser checks run after integrated production/fixture builds.

### Task 2: Reuse catalog facts and bound card updates

**Ownership:** src/features/kits/project-batch.ts, src/features/kits/use-project-batch-selection.ts; src/features/catalog/components/project-grid.tsx, project-card.tsx, filter-panel.tsx, filter-controls.tsx, catalog-page.tsx; src/features/kits/components/kit-filter-panel.tsx; focused batch/filter/card tests.

**Interfaces:** Preserve planKitProjectBatch's existing caller contract; an optional prebuilt lookup is acceptable if all existing callers retain behavior. Preserve ProjectCard and selection control semantics.

- [x] Add one failing regression proving repeated per-card lookup construction or irrelevant parent updates; preserve existing behavioral test assertions.
- [x] Build catalog identity/kind lookup once per catalog input and reuse it during candidate planning. Keep one shared lookup when catalog changes and preserve unknown IDs, ordering, limits, and frontend replacement.
- [x] Memoize stable ProjectCard bodies and other safe boundaries with stable inputs. Avoid custom equality functions that hide changes.
- [x] Cache immutable filter counts/options and remove repeated matching where equivalent shared results are available. Preserve query-dependent count semantics.
- [x] Run focused batch/filter/card/search tests and report regression evidence. Do not edit drag, popover, panel, or CSS files.

### Task 3: Coalesce movement and floating-surface positioning

**Ownership:** src/features/kits/use-project-stack-drag.ts, src/features/kits/components/kit-builder.tsx; src/components/ui/tooltip.tsx; src/features/search/components/search-help.tsx; src/features/catalog/components/tavernkeeper-scan-indicator.tsx; a narrowly scoped shared frame utility/hook if useful; focused movement/positioning tests.

**Interfaces:** Preserve drag hook outputs/callbacks and portal/dialog behavior. Any shared scheduler must cancel pending frames on cleanup and allow fresh scheduling afterward.

- [x] Add one failing regression at a time for burst coalescing, pending pointerup/cancel correctness, and close/unmount cancellation.
- [x] Coalesce drag pointer movement to animation frames; retain latest coordinates and finalize the latest target on release. Keep row geometry fresh across scroll/resize/order changes. Preserve existing touch thresholds, keyboard order, and cancellation.
- [x] Avoid rebuilding stable builder lookup/layout/validation on ghost-coordinate-only updates where safe.
- [x] Batch open tooltip/search/scan positioning on scroll/resize to one animation frame; skip identical position state and cancel on cleanup. Keep immediate initial positioning and no idle closed-surface listeners.
- [x] Run focused tests and report exact results. Do not edit Task 1/2 ownership files.

### Task 4: Integration, measurement, review, and merge

**Ownership:** Coordinator integration, verification commands, optional benchmark/browser regression harness, PR description, GitHub operations; independent reviewer evaluates the complete diff.

- [x] Review task reports and changes; fix actionable review findings and reverify.
- [x] Run npm run check, relevant production catalog browser/visual checks, and deterministic Kit fixture browser checks. Record any pre-existing failure separately and resolve affected failures before merge.
- [x] Repeat production panel/scroll diagnostic against a same-data current-main baseline and enhanced build, preserving workload conditions. Report observed changes without extrapolating to physical Safari.
- [x] Obtain independent whole-branch review and address blocking findings.
- [ ] Commit only intended changes, push codex/rendering-performance, create PR against main, and attach it to this chat.
- [ ] Wait for required CI/review state, merge through GitHub CLI without bypassing branch protections, and verify merged state. Preserve original local changes.
