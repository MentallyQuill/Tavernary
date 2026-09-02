# Pull Request Backlog Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute source changes task-by-task. Operational GitHub work remains with the controller.

**Goal:** Restore deterministic publication validation, land the compatible dependency updates, reject the incompatible ESLint major, and publish the two valid project submissions from current `main`.

**Architecture:** Repair only evidenced nondeterminism in the shared browser gates, land that repair before evaluating dependency updates, then regenerate each generated submission sequentially so every published transaction has current-main ancestry and exact-head validation. Preserve the trusted Publisher boundary and prove the resulting Pages deployment live.

**Tech Stack:** Next.js 16 static export, TypeScript, Vitest, Playwright, GitHub Actions, GitHub CLI.

## Global Constraints

- Preserve the dirty primary checkout; all source work occurs in isolated worktrees.
- Do not lower visual or performance budgets without a reproduced root cause and a behavior-preserving deterministic replacement.
- Keep generated submission custody in the existing issue, generator, validation, and Publisher workflows.
- Validate and merge one generated submission at a time from current `main`.
- Require exact-head checks before every merge and exact-merge-SHA Pages proof afterward.
- Keep public catalog copy factual, player-facing, and free of internal authority language.

---

### Task 1: Deterministic fork-relationship screenshots

**Files:**

- Modify: `tests/visual/catalog.visual.spec.ts`

- [x] Preserve the current three failing fork-relationship screenshots as RED evidence.
- [x] Stabilize the inline freshness color input together with the displayed activity age.
- [x] Run the focused fork-relationship visual cases and verify GREEN without refreshing snapshots or widening tolerances.
- [x] Run the complete visual suite and the relevant unit suite.
- [x] Commit the focused repair.

### Task 2: Catalog performance gate diagnosis

**Files:**

- Modify only files justified by repeated local evidence.

- [x] Run the current-main catalog performance scenario repeatedly at the 462-card submission size.
- [x] Record feature-off, full-catalog, and filtered measurements and classify any failure as product regression, measurement race, or hosted-runner variance.
- [x] If reproducible, write or preserve a failing behavioral test before the smallest repair; if not reproducible, leave the budget unchanged and document the evidence.
- [x] Re-run the focused performance gate to verify the conclusion.

### Task 3: CI repair integration

- [ ] Run `npm.cmd run check` and all browser gates used by the publication workflow.
- [ ] Review the complete branch diff against this plan.
- [ ] Push a focused CI-stability PR, require current exact-head checks, merge it, and verify the merge-SHA Pages deployment.

### Task 4: Compatible dependency rollup

**Inputs:** PRs #648, #649, #650, and #651.

- [ ] Start from the new current `main` in a fresh isolated worktree.
- [ ] Apply only `@testing-library/user-event` 14.6.6, Vitest 4.1.11, `@types/node` 26.3.0, and Next.js 16.3.2.
- [ ] Run the full unit, build, visual, end-to-end, scan-performance, and Kits gates.
- [ ] Push one rollup PR, require current exact-head checks, merge it, and verify Pages.
- [ ] Close the superseded Dependabot PRs with links to the merged rollup.

### Task 5: Incompatible ESLint major

**Input:** PR #652.

- [ ] Confirm the ESLint 10 failure and current plugin peer constraints on the live PR head.
- [ ] Configure Dependabot to ignore the unsupported ESLint major if the repository does not already do so.
- [ ] Land that scoped configuration through a verified PR if a source change is needed.
- [ ] Close #652 with the exact compatibility evidence and future unblocking condition.

### Task 6: Publish project submission #657

**Inputs:** issue #656 and PR #657.

- [ ] Correct the source-backed summary and categories through the canonical submission authority.
- [ ] Regenerate from current `main`; do not hand-edit the signed generated transaction.
- [ ] Require focused feedback plus the exact-head full publication validation.
- [ ] Merge through Publisher, verify issue/PR lifecycle state, deployment SHA, and the live hydrated catalog entry.

### Task 7: Publish project submission #659

**Inputs:** issue #658 and PR #659.

- [ ] Preserve the already-correct source-backed metadata.
- [ ] Regenerate from the main that includes #657.
- [ ] Require focused feedback plus the exact-head full publication validation.
- [ ] Merge through Publisher, verify issue/PR lifecycle state, deployment SHA, and the live hydrated catalog entry.

### Task 8: Final inventory

- [ ] Confirm no targeted PR remains open without an explicit disposition.
- [ ] Confirm `main`, the catalog artifact, Pages, and the live UI all contain both accepted projects.
- [ ] Report merged and closed PRs, exact validation/deployment runs, and any residual follow-up.
