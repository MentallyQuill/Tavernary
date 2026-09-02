# Project Validation Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair generated-project validation liveness, remove the deterministic visual blocker, delist the misclassified Twemoji card without erasing history, and drain issues #656 and #658 through live publication.

**Architecture:** Every trusted generated exact-head CI outcome directly dispatches the serialized reconciler. The reconciler waits only for terminal completion and delegates success/failure policy to the existing bounded controller. The visual test uses deterministic fixture text while retaining strict screenshot comparison. Twemoji uses the existing source-tombstone lifecycle so catalog discovery hides it and Kit history reports it unavailable.

**Tech Stack:** GitHub Actions YAML, GitHub CLI, Node.js 24 ESM, Vitest, Playwright, Next.js 16.3.1 static export, JSON registry data.

**Spec:** `docs/superpowers/specs/2026-09-02-project-validation-recovery-design.md`

## Global constraints

- Work only in `F:\git\Tavernary\.worktrees\issue-automation-repair`; do not touch the dirty primary checkout.
- Use current `origin/main` before final verification and delivery because security report imports may advance `main`.
- Preserve all generated-branch trust, exact-SHA, actor, path, retry-limit, and Publisher App checks.
- Do not raise screenshot or performance tolerances.
- Process #656 and #658 serially after the repair reaches `main`.
- Preserve Twemoji project, source, snapshot, and Kit records as history.

---

### Task 1: Prove and repair conclusion-complete validation handoff

**Files:**

- Modify: `tests/unit/project-automatic-publication-workflow.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/reconcile-project-validations.yml`

- [ ] **Step 1: Write failing workflow contract assertions**

Rename the success-only test to describe all generated outcomes. Assert that `reconcile-generated-validation.if` contains `always()` and the generated branch restrictions but does not contain `needs.verify.result == 'success'` or `needs.visual.result == 'success'`. Assert that the wait step contains `gh run watch "$VALIDATION_RUN_ID"` and does not contain `--exit-status`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/project-automatic-publication-workflow.test.ts
```

Expected: failure on the two success predicates and `--exit-status`.

- [ ] **Step 3: Make the handoff outcome-complete**

In `.github/workflows/ci.yml`, retain `always()`, `workflow_dispatch`, and both generated branch prefix checks. Remove only the two dependency-result predicates. Do not change permissions or the exact run-ID dispatch.

- [ ] **Step 4: Make the wait conclusion-neutral**

In `.github/workflows/reconcile-project-validations.yml`, remove `--exit-status` from the `gh run watch` step. Update the input description from completed-run wording to `Generated validation run to await and reconcile` and update the exact test expectation.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
npx.cmd vitest run tests/unit/project-automatic-publication-workflow.test.ts tests/unit/workflows.test.ts
```

Expected: all workflow contract tests pass.

---

### Task 2: Stabilize the localized fork-relationship visual fixture

**Files:**

- Modify: `tests/visual/catalog.visual.spec.ts`
- Modify: `tests/visual/catalog.visual.spec.ts-snapshots/fork-relationship-desktop-standard-win32.png`
- Modify: `tests/visual/catalog.visual.spec.ts-snapshots/fork-relationship-desktop-compact-win32.png`
- Modify: `tests/visual/catalog.visual.spec.ts-snapshots/fork-relationship-mobile-win32.png`

- [ ] **Step 1: Preserve RED evidence**

Use the already-recorded clean-main `npm.cmd run test:visual` result: all three scenarios fail with 84 pixels and each diff highlights only `11d ago`. Do not change tolerance.

- [ ] **Step 2: Use a proven stable age glyph sequence**

Change the second fixture label from `11d ago` to `2d ago`. Add an assertion after stabilization that both labels have the exact fixture text, keeping semantic content coverage separate from pixels. Remove the stale hosted-difference comment but retain `maxDiffPixels: 20`.

- [ ] **Step 3: Refresh only the three controlled snapshots**

Run:

```powershell
npx.cmd playwright test --config playwright.config.ts --project=chromium tests/visual/catalog.visual.spec.ts --grep "fork relationship .* visual" --update-snapshots
```

If the repository wrapper is required for the static export, set `PLAYWRIGHT_UPDATE_SNAPSHOTS=all`, run the focused visual test through the wrapper, and then remove the environment variable.

Inspect all three new PNGs and confirm the only intended content change is the second age label.

- [ ] **Step 4: Verify focused GREEN twice**

Run the focused relationship visual test twice without snapshot update. Expected: all three scenarios pass both times.

---

### Task 3: Tombstone Twemoji while preserving Kit history

**Files:**

- Modify: `tests/unit/full-catalog-data.test.ts`
- Modify: `data/registry/sources/github-26291683.json`
- Regenerate: `public/catalog/tavernary-catalog.json`
- Regenerate: `public/catalog/tavernary-catalog-v8.json`

- [ ] **Step 1: Add the failing production-data decision test**

Build the production catalog from the real registry data. Add a test named `keeps the misclassified Twemoji source tombstoned without rewriting Kit history` that asserts:

- source `github-26291683` is `delisted`, `removed`, and `paused`;
- public catalog projects do not contain `twitter-twemoji`;
- Kits `232-153` and `test-135` retain components with `projectId: twitter-twemoji`, `availability: flagged`, `unavailableReason: removed`, `canonicalUrl: null`, and `project: null`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/full-catalog-data.test.ts
```

Expected: source and public catalog expectations fail while Twemoji is active.

- [ ] **Step 3: Apply the established tombstone**

Change only `data/registry/sources/github-26291683.json` to `status: delisted`, `status_reason: removed`, and `refresh_policy: paused`. Leave the project, snapshots, and Kit records untouched.

- [ ] **Step 4: Rebuild and verify GREEN**

Run:

```powershell
npm.cmd run catalog:validate
npm.cmd run catalog:build
npx.cmd vitest run tests/unit/full-catalog-data.test.ts
```

Expected: schemas validate, the generated catalog excludes Twemoji, both Kit references remain unavailable, and the production-data suite passes.

---

### Task 4: Integrated local verification and review

**Files:** all changed files.

- [ ] **Step 1: Re-fetch and integrate current main safely**

Run `git fetch origin main`. If `origin/main` advanced, rebase the clean repair branch onto it without force-resetting or modifying the primary checkout. Resolve only repair-file overlaps and rerun all following gates.

- [ ] **Step 2: Run focused suites**

```powershell
npx.cmd vitest run tests/unit/project-automatic-publication-workflow.test.ts tests/unit/workflows.test.ts tests/unit/full-catalog-data.test.ts
npm.cmd run test:visual
npm.cmd run test:scan-e2e
```

Expected: all pass; performance remains inside existing thresholds.

- [ ] **Step 3: Run the complete gate**

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette, catalog, security, TypeScript, unit, build, and static-export verification all pass.

- [ ] **Step 4: Inspect artifacts and diff**

Verify only the intended three snapshots changed, Twemoji is absent from both generated public catalog versions, its two Kit components are unavailable, workflow permissions are unchanged, and `debug.log` has no test-generated additions. Review `git diff --check` and `git status --short`.

- [ ] **Step 5: Commit the repair**

Stage only the workflow, registry source, generated catalogs, focused tests and snapshots, design, and plan. Commit with `fix(submissions): recover failed validation runs`.

---

### Task 5: Deliver the repair through GitHub and Pages

- [ ] **Step 1: Push and open the PR**

Push `codex/issue-automation-repair`, open a PR that explains the causal chain, includes `Closes #653`, and lists the exact verification evidence. Do not claim #656 or #658 are fixed until their regenerated transactions publish.

- [ ] **Step 2: Verify exact-head checks and merge**

Watch every required PR check. If a check fails, inspect its exact log and repair the cause on the same branch. Merge only when required checks pass and the head SHA matches the reviewed SHA.

- [ ] **Step 3: Verify exact merge deployment**

Watch the Pages deployment for the merge SHA. Verify the live catalog JSON and hydrated catalog: Twemoji is absent from project discovery, Kits `232-153` and `test-135` still render, and their Twemoji component is unavailable without a project link.

---

### Task 6: Regenerate and drain #656

- [ ] **Step 1: Dispatch normal regeneration**

After confirming `main` contains the repair and no conflicting maintenance publication is active, dispatch `generate-project-submission.yml` for issue `656` with `force_regeneration=false`.

- [ ] **Step 2: Follow the full state machine**

Verify the new generated branch starts from current `main`; record its head SHA; watch exact-head validation; confirm the outcome-complete handoff wakes reconciliation; watch Publisher merge; confirm #656 closes and PR #657 (or its replacement) reaches the appropriate terminal state.

- [ ] **Step 3: Verify Pages and the live card**

Watch deployment of the publication merge SHA and verify `mokimoko/SillyTavern-UIBedazzler` appears in live catalog JSON and hydrated catalog UI.

---

### Task 7: Regenerate and drain #658

- [ ] **Step 1: Dispatch only after #656 is terminal**

Dispatch `generate-project-submission.yml` for issue `658` with `force_regeneration=false` from the now-current `main`.

- [ ] **Step 2: Follow the full state machine**

Record the new head SHA; watch exact-head validation and direct reconciliation handoff; watch Publisher merge; confirm #658 closes and PR #659 (or its replacement) reaches the appropriate terminal state.

- [ ] **Step 3: Verify Pages and the live card**

Watch deployment of the publication merge SHA and verify `Shin-F/Persona-Multi-Avatars` appears in live catalog JSON and hydrated catalog UI.

---

### Task 8: Final queue audit

- [ ] List open project-submission and project-report issues and open generated project PRs.
- [ ] Confirm no repaired issue is left with `submission-validation-retrying` or `submission-validation-blocked`.
- [ ] Confirm `main`, the deployed Pages SHA, and the live catalog agree on both newly published projects and the Twemoji tombstone.
- [ ] Report exact PR, workflow-run, merge, deployment, and live verification links to the user.
