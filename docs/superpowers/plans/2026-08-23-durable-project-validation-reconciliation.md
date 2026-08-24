# Durable Project Validation Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make automatic generated project transactions self-healing across validation failures, stale `main`, and lost publication handoffs while preserving Tavernary's trusted Publisher boundary.

**Architecture:** A pure planner derives one action for each current signed generated PR from its exact-head validation and publication runs. A trusted default-branch reconciliation workflow applies those actions idempotently, projects state onto the issue and commit, and wakes on both workflow completion and a staggered schedule. The explicit branch validation remains publication authority; focused PR feedback and deterministic browser/performance gates remove duplicate cost and runner noise.

**Tech Stack:** Node.js 24 ESM, GitHub REST/Actions workflows, Vitest, Playwright, YAML, TypeScript declarations.

**Spec:** `docs/superpowers/specs/2026-08-23-durable-project-validation-reconciliation-design.md`

## Global Constraints

- Reconciliation executes checked-out `main` code only and never exposes write permissions or secrets to pull-request code.
- Only schema-2, same-repository, exact-head, automatic project transactions are eligible.
- Three completed unsuccessful attempts for one head SHA is the hard retry limit; a new generated head starts a new cycle.
- Publisher remains the only merge authority and must revalidate actor, source, paths, input fingerprints, and exact SHA.
- Manual publication transactions are ignored by automatic reconciliation.
- Existing generated-path and malicious-contributor protections must remain unchanged.
- The primary checkout's user-owned changes remain untouched.

---

### Task 1: Exact-head reconciliation planner

**Files:**

- Create: `scripts/submissions/project-validation-reconciliation.mjs`
- Create: `scripts/submissions/project-validation-reconciliation.d.mts`
- Create: `tests/unit/project-validation-reconciliation.test.ts`

**Interfaces:**

- Consumes: schema-2 transaction objects from `parseProjectPublicationTransaction()`.
- Produces: `planProjectValidationReconciliation(input): ProjectValidationPlan`, `projectValidationStateComment(input): string`, and constants for retry/grace limits and owned labels.

- [ ] **Step 1: Write failing planner tests**

Cover literal fixtures for: no run → `validate`; active run → `wait`; one or two failed current-head runs → `retry-validation`; three failures → `block`; success inside five-minute handoff grace → `wait`; success without Publisher after grace → `publish`; active Publisher → `wait`; failed Publisher below attempt three → `retry-publication`; exhausted Publisher → `block`; successful Publisher with an unchanged automatic PR beyond regeneration grace → `regenerate`; manual transaction → `ignore`; and old-head attempts excluded from the current count.

```ts
test("retries fewer than three failed exact-head validations", () => {
  expect(
    planProjectValidationReconciliation({
      transaction: automaticTransaction,
      headSha: HEAD_SHA,
      validationRuns: [failedRun(1), failedRun(2)],
      publicationRuns: [],
      nowMs: NOW,
    }),
  ).toMatchObject({ action: "retry-validation", attempts: 2 });
});
```

- [ ] **Step 2: Run the planner test and verify RED**

Run: `npx.cmd vitest run tests/unit/project-validation-reconciliation.test.ts`

Expected: FAIL because `project-validation-reconciliation.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure planner and comment renderer**

Use explicit terminal and active conclusion sets, sort by `created_at`, filter every run by `head_sha`, and return a discriminated action object. Render one marker:

```js
export const PROJECT_VALIDATION_STATE_MARKER =
  "<!-- tavernary-project-validation-state";

export function projectValidationStateComment({ state, headSha, attempts, run }) {
  const marker = {
    schema_version: 1,
    status: state,
    head_sha: headSha,
    attempts,
    run_id: run?.id ?? null,
  };
  return `${PROJECT_VALIDATION_STATE_MARKER}\n${JSON.stringify(marker)}\n-->\n${humanText}`;
}
```

- [ ] **Step 4: Run the planner tests and verify GREEN**

Run: `npx.cmd vitest run tests/unit/project-validation-reconciliation.test.ts`

Expected: all planner tests pass.

- [ ] **Step 5: Commit the planner**

```powershell
git add scripts/submissions/project-validation-reconciliation.mjs scripts/submissions/project-validation-reconciliation.d.mts tests/unit/project-validation-reconciliation.test.ts
git commit -m "feat(submissions): plan validation recovery"
```

### Task 2: Trusted reconciliation CLI and state projection

**Files:**

- Create: `scripts/submissions/reconcile-project-validations.mjs`
- Create: `scripts/submissions/reconcile-project-validations.d.mts`
- Create: `tests/unit/reconcile-project-validations.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `planProjectValidationReconciliation`, GitHub REST request function, repository name, and current time.
- Produces: `reconcileProjectValidations({ repository, request, nowMs }): Promise<ReconciliationSummary>` and CLI `npm run submissions:reconcile-validations`.

- [ ] **Step 1: Write failing orchestration tests against a complete fake GitHub boundary**

Use complete PR, issue, validation-run, and publication-run response fixtures. Assert observable requests and summary results for:

- same-repository signed automatic PR dispatches missing validation;
- a failed current head receives retry label/comment/status and another `ci.yml` dispatch;
- exhausted attempts receive blocked label/comment/failure status and no dispatch;
- successful validation without handoff dispatches `publish-project-transaction.yml` after grace;
- failed Publisher reruns failed jobs below the attempt limit;
- stale automatic PR dispatches regeneration after grace;
- manual, malformed, fork-owned, changed-head, and closed PRs cause no mutation;
- pagination and a second live PR read prevent stale-head mutation.

```ts
expect(requests).toContainEqual({
  method: "POST",
  path: "/repos/MentallyQuill/Tavernary/actions/workflows/ci.yml/dispatches",
  body: { ref: "automation/project-submission-620" },
});
```

- [ ] **Step 2: Run the CLI unit test and verify RED**

Run: `npx.cmd vitest run tests/unit/reconcile-project-validations.test.ts`

Expected: FAIL because the reconciliation CLI does not exist.

- [ ] **Step 3: Implement read-only inventory and exact candidate validation**

Paginate open PRs, filter same-repository automation heads, parse the transaction, require `generated_head_sha === pull.head.sha`, load exact `workflow_dispatch` CI runs for the head, and load Publisher runs whose display title names the successful validation ID.

- [ ] **Step 4: Implement guarded mutations and idempotent projections**

Before each dispatch or issue mutation, re-fetch the PR and compare `state`, `head.sha`, `head.ref`, and `base.ref`. Create owned labels with stable descriptions, replace only the controller marker comment, update labels through one issue-label request, and post commit status context `tavernary/publication-validation`.

- [ ] **Step 5: Implement workflow dispatch and rerun actions**

Dispatch exact validation, publication, or regeneration through GitHub workflow-dispatch endpoints. Retry a failed Publisher through `/actions/runs/{run_id}/rerun-failed-jobs`. Return per-PR action summaries without aborting unrelated candidates when one PR becomes stale during reconciliation.

- [ ] **Step 6: Run the CLI and planner tests and verify GREEN**

Run: `npx.cmd vitest run tests/unit/project-validation-reconciliation.test.ts tests/unit/reconcile-project-validations.test.ts`

Expected: all tests pass with no unhandled request.

- [ ] **Step 7: Commit the controller**

```powershell
git add package.json scripts/submissions/reconcile-project-validations.mjs scripts/submissions/reconcile-project-validations.d.mts tests/unit/reconcile-project-validations.test.ts
git commit -m "feat(submissions): reconcile validation state"
```

### Task 3: Trusted wake workflow and canonical generated validation

**Files:**

- Create: `.github/workflows/reconcile-project-validations.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/unit/project-automatic-publication-workflow.test.ts`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**

- Consumes: `npm run submissions:reconcile-validations` and existing exact `ci.yml`/Publisher workflow inputs.
- Produces: workflow-run, scheduled, and owner-only manual wakeups with `actions: write`, `issues: write`, `pull-requests: read`, `statuses: write`, and `contents: read`.

- [ ] **Step 1: Write failing workflow contract tests**

Assert the new workflow's exact display name, triggers, staggered cron, permissions, non-cancelling concurrency, checkout of `main`, Node 24, no dependency installation, actor restriction for manual dispatch, and controller command. Assert generated pull-request events select focused content feedback while a generated branch `workflow_dispatch` keeps the full route.

- [ ] **Step 2: Run workflow contract tests and verify RED**

Run: `npx.cmd vitest run tests/unit/project-automatic-publication-workflow.test.ts tests/unit/workflows.test.ts`

Expected: FAIL because the workflow and generated-PR route do not exist.

- [ ] **Step 3: Add the trusted reconciliation workflow**

Use:

```yaml
on:
  workflow_run:
    workflows: ["Site: Validate changes"]
    types: [completed]
  schedule:
    - cron: "7,22,37,52 * * * *"
  workflow_dispatch:
```

The job executes only for generated branches on `workflow_run`, or for schedule, or an owner/Publisher manual dispatch. Checkout explicitly uses `ref: main`.

- [ ] **Step 4: Route generated PR feedback through focused checks**

Pass `PR_HEAD_REF` into CI classification. When the event is `pull_request` and the head begins with an automation project prefix, select `content`; leave the explicit branch workflow-dispatch route unchanged as `full`.

- [ ] **Step 5: Run workflow tests and verify GREEN**

Run: `npx.cmd vitest run tests/unit/project-automatic-publication-workflow.test.ts tests/unit/workflows.test.ts`

Expected: all workflow contract tests pass.

- [ ] **Step 6: Commit workflow integration**

```powershell
git add .github/workflows/reconcile-project-validations.yml .github/workflows/ci.yml tests/unit/project-automatic-publication-workflow.test.ts tests/unit/workflows.test.ts
git commit -m "ci: reconcile generated validation runs"
```

### Task 4: Deterministic generated-branch gates

**Files:**

- Modify: `tests/e2e/project-submission.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts`
- Modify: `tests/e2e/catalog-mobile-performance.spec.ts`
- Modify: `tests/unit/kit-workflow-git-recovery.test.ts`
- Modify: `tests/unit/reset-project-submission-branch.test.ts`

**Interfaces:**

- Consumes: current Playwright pages and fixture builds.
- Produces: exact accessible-name selectors, tooltip readiness assertion, relative performance budget helper, and explicit Git-operation test timeouts.

- [ ] **Step 1: Preserve RED evidence from live runs and local baseline**

Record the already-observed failures in the implementation notes: PR #619's overlapping frontend label; run `32689403527`'s unstyled tooltip screenshot; run `32689240716`'s 204.5/211.5ms frame gaps; and the baseline's three five-second Git test timeouts. No production fix is written before this evidence.

- [ ] **Step 2: Make frontend checkbox selectors exact**

Replace every `page.getByLabel("SillyTavern")` checkbox access with:

```ts
page.getByRole("checkbox", { name: "SillyTavern", exact: true })
```

This retains accessible behavior while preventing vocabulary prefix collisions.

- [ ] **Step 3: Add a computed-style readiness assertion before tooltip screenshots**

Create a test helper that polls the real tooltip element until `position === "fixed"`, `fontSize === "9px"`, visible state, and nonzero padding. Use it for all three card-control tooltip screenshots so an unstyled portal waits and a permanently unstyled portal fails directly.

- [ ] **Step 4: Replace the single absolute frame-gap assertion with controlled relative limits**

Keep the feature-off absolute ceiling at 300ms. Require full and filtered frame gaps to stay below both 300ms and `max(225ms, featureOff * 1.35)`. Retain existing long-task, listener, observer, DOM, SVG, and glyph assertions.

- [ ] **Step 5: Give real Git integration fixtures an explicit 20-second timeout**

Add `20_000` as the Vitest timeout only to the three Git-heavy tests that exceeded the UI-unit default; do not change their assertions or global test timeout.

- [ ] **Step 6: Run focused gates**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-workflow-git-recovery.test.ts tests/unit/reset-project-submission-branch.test.ts
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e -- --grep "project submission|selects multiple current frontends|stable manifest"
npm.cmd run build:test-kits
npm.cmd run test:kits-visual -- --grep "hover"
npm.cmd run test:scan-e2e -- --grep "TavernKeeper catalog cost"
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit deterministic gates**

```powershell
git add tests/e2e/project-submission.spec.ts tests/kits-e2e/kits.visual.spec.ts tests/e2e/catalog-mobile-performance.spec.ts tests/unit/kit-workflow-git-recovery.test.ts tests/unit/reset-project-submission-branch.test.ts
git commit -m "test: stabilize publication gates"
```

### Task 5: Full verification and review

Final review also requires Publisher-authored PR custody, live source-issue authority, `run_attempt` and multi-validation accounting, Publisher-routed regeneration with issue-scoped in-flight discovery, nonzero CLI failure signaling, terminal lifecycle cleanup, and exact overlap coverage in the visual submission handoff.

**Files:**

- Modify only files required by review findings.

**Interfaces:**

- Consumes: all prior task outputs.
- Produces: a clean branch whose complete local gate is fresh and whose diff matches the approved spec.

- [ ] **Step 1: Run formatting on changed implementation paths**

Run `npx.cmd prettier --write` with the exact changed file list, then verify `git diff --check`.

- [ ] **Step 2: Run the complete gate**

Run: `npm.cmd run check`

Expected: formatting, lint, palette, catalog, security reports, build, types, all Vitest files, static export, and verification pass.

- [ ] **Step 3: Run complete browser gates used by CI**

Run:

```powershell
npm.cmd run test:e2e
npm.cmd run test:scan-e2e
npm.cmd run test:visual
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
```

Expected: all applicable browser and visual suites pass with documented fixture skips only.

- [ ] **Step 4: Review the diff against the spec**

Check every goal/security constraint, inspect `git diff --stat`, `git diff --check`, and the complete workflow permission surface. Correct only confirmed gaps and rerun affected tests.

- [ ] **Step 5: Commit any review corrections**

Use a concise conventional commit describing the confirmed correction.

### Task 6: Integration, live reconciliation, and backlog drain

**Files:**

- No planned source changes; operational recovery only.

**Interfaces:**

- Consumes: verified branch, GitHub Actions, Publisher App, Pages, and live catalog.
- Produces: merged repair, current submissions published or explicitly blocked, and exact-SHA deployment proof.

- [ ] **Step 1: Rebase onto current remote `main` in the isolated worktree**

Fetch, rebase, and rerun affected focused tests if `main` advanced. Never reset or alter the dirty primary checkout.

- [ ] **Step 2: Push the branch and open a PR**

Push `codex/durable-submission-reconciliation`, create a neutral PR describing root cause, security boundary, tests, and live recovery plan.

- [ ] **Step 3: Watch exact PR checks and resolve only evidenced failures**

Require the current PR head's complete verify and visual gates. Rerun an unchanged exact head only for diagnosed hosted-runner flakiness.

- [ ] **Step 4: Merge through the owner/Publisher-safe path**

Merge without weakening rulesets, confirm the exact merge SHA, and wait for the Pages run associated with that SHA.

- [ ] **Step 5: Dispatch reconciliation once and monitor conditionally**

Run `reconcile-project-validations.yml` on `main`. Follow each open automatic issue/PR through retry, regeneration, exact validation, Publisher merge, lifecycle closure, and deployment. Do not bulk-close items.

- [ ] **Step 6: Verify final inventory and live catalog**

Confirm zero unexplained open automatic submissions/PRs, successful exact-SHA Pages build/deploy, HTTP 200, and hydrated/live catalog presence for accepted projects. Report any intentionally blocked item with its exact run and diagnostic.
