# Integration and Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution or superpowers:subagent-driven-development if selected. Steps use checkbox (`- [x]`) syntax.

**Goal:** Prove the complete overhaul, submit and merge its PRs, and verify production.

**Architecture:** Fault-injected integration exercises production planners/adapters with authoritative fixtures. Exact checked and merged heads, live Actions results, artifact integrity and public revision evidence populate the final requirement ledger.

**Tech Stack:** Node.js, ESM declarations, TypeScript, Vitest, Playwright, GitHub CLI/Actions/Pages/artifacts/releases.

**Spec:** [Approved design](../specs/2026-10-07-unattended-operation-design.md).

**Bounded handoff, October9:** The owner requested wrap-up after the extended
delivery. Eleven implementation PRs are merged and current production is verified.
Further engineering is frozen. The current ledger records the remaining native
dependency acceptance check explicitly; unchecked audit steps below are not a
request to expand scope or drain historical queued work.

## Global Constraints

- GitHub-only infrastructure; no external watchdog or off-site backups.
- Preserve immutable identities, exact-head validation, Publisher custody, owner authority, tombstones, manual publication mode, and required `verify`/`visual` checks.
- Fifteen-minute reconciliation; twenty operations per pass; stable oldest-eligible ordering.
- Three immediate worker attempts; transient delays: five minutes, fifteen minutes, one hour, six hours, twenty-four hours, with bounded jitter and Retry-After.
- Scheduled enrichment: ten sources, concurrency two, forty model requests/day, two hundred thousand requested tokens/day, including repairs.
- Existing public catalog and Companion contracts remain supported.
- Implement in the isolated worktree; preserve the original checkout. Read installed Next.js guides before changing application code.

## Test Fixtures

`tests/helpers/automation-fixtures.ts` owns the named fixture builders in this plan.
Each task that introduces a builder also updates that file. Builders are typed
to the consuming production interface, use existing valid catalog/transaction
fixtures, and inject recorded API effects and clocks. Flow builders execute
the production functions; their counters come from observed effects, not
scenario flags.

## Review Focus

- Seventy-two-hour outage spans day/month budget boundaries: resume safely without duplicate publication.
- Every handoff is interrupted after its durable side effect: reconstruct the next stage.
- Newer public data includes a delist: old deploy/rollback requests remain denied.
- Full CI reveals existing or introduced failures: investigate causes rather than weakening checks.
- Merge succeeds but Pages is stale or broken: goal remains active until actual confirmation.

### Task 1: End-to-end fault-injected recovery

**Files:** Create `tests/unit/automation-end-to-end.test.ts`, trusted fixture canary adapter under `tests/helpers/automation-canary.ts`, and `.github/workflows/verify-automation.yml`; extend existing authority/static/consumer tests.

**Interfaces:** Consume production classifiers, inventories, controller, writer, budget and deployment/confirmation functions. The injected canary uses isolated owned fixtures and records API effects; it must not fabricate public listings, submit third-party issues or execute third-party code.

- [x] **Step 1: Add the failing behavioral test.**

```ts
test("lost events and a seventy-two-hour outage recover exactly once", async () => {
  const canary = automationCanary({ outageHours: 72, droppedStages: "all" });
  await canary.recover();
  expect(canary.canonicalPublications).toBe(1);
  expect(canary.confirmedDeployments).toBe(1);
  expect(canary.finalizations).toBe(1);
  expect(canary.authorityViolations).toBe(0);
});
```

- [x] **Step 2: Verify RED.** Run `npx vitest run tests/unit/automation-end-to-end.test.ts`; expect the new behavior/import to fail, and identify unrelated baseline failures separately.
- [x] **Step 3: Implement.** Run project, owner and Kit eligible paths through each interrupted handoff, including merge-before-cancellation and confirmation-before-bookkeeping. Inject reordered events, multiple API pages, same-key races, corrupted receipts, expired credentials, mismatched artifacts, transient/permanent failures, new input and provider recovery. Test old-revision and owner-delist rollback denial, manual exceptions and budget rollover. Add trusted main-branch canary command with mutation-free fixture adapters.
- [x] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/automation-end-to-end.test.ts` and `npm run typecheck`; expect exit 0.
- [x] **Step 5: Review and commit.** Stage the named deliverable; use `test(automation): prove complete recovery flows`.

### Task 2: Full CI, independent review, PR submission and merge

**Files:** Update `docs/maintenance/longevity-verification.md` and master-plan checkpoints; code changes require a diagnosed failure and its regression test.

**Interfaces:** Produce R1-R18 evidence entries containing actual commands/results, attached PRs, exact checked and merged heads, review resolution, and public revisions.

- [x] **Step 1: Run the full repository gate.** Run `npm run check`; require exit 0 and inspect every component's output.
- [x] **Step 2: Run the browser/visual matrix.** Reproduce all commands in current `ci.yml`, including `test:e2e`, `test:scan-e2e`, `test:scan`, `test:visual`, `build:test-kits`, `test:kits-e2e`, and `test:kits-visual`. Confirm platform-specific cases through their actual Linux/Windows CI jobs.
- [x] **Step 3: Obtain independent review.** Use the selected execution method's fresh reviewer. Resolve verified findings with regression-first fixes; rerun only checks justified by the changed code, followed by required final gates.
- [x] **Step 4: Submit and attach implementation PRs.** Use `gh` with network permission, a body file preserving newlines, and the implementation's actual problem/behavior/validation. Attach each created PR with the app artifact tool.
- [x] **Step 5: Resolve CI and integration challenges.** Inspect exact-head `verify` and `visual`, diagnose failures, fix conflicts on current main, resolve feedback, and repeat required checks after changes. Never suppress required checks, weaken rulesets, or mistake cancelled/obsolete runs for current results.
- [x] **Step 6: Merge and record evidence.** Inspect current rules and permissions. Merge with exact-head matching only after the required check evidence and independent review are complete, using existing authorized permissions. Record merged SHA and PR state. The active goal authorizes completing this work; opening a PR is not its end state.

### Task 3: Production confirmation and completion audit

**Files:** Update `docs/maintenance/longevity-verification.md` and the owner runbook with verified outcomes.

**Interfaces:** Consume live GitHub state, public revision and asset digests, trusted canary/drill runs, retained bundles, and current rulesets. Produce verified/incomplete status and authoritative evidence for every R1-R18 requirement.

- [x] **Step 1: Inspect merged production state.** Read current main and all required PR merged states. Record checked/merged revisions and actual Actions conclusions.
- [x] **Step 2: Run and observe the trusted canary.** Dispatch the mutation-free fixture canary on trusted main. Confirm a live handle before waiting, follow it to terminal completion, and inspect the recorded production-adapter effects.
- [x] **Step 3: Confirm the public deployment.** Verify expected public SHA, catalog and target digests, then run public browser smoke. A merge or queued deployment without confirmation remains unfinished.
- [x] **Step 4: Perform the real GitHub artifact restore drill.** Download a retained verified bundle, validate integrity, serve it in a clean workspace and run smoke with source/model-provider requests blocked. Inspect retention protections.
- [ ] **Step 5: Verify live controller and maintenance evidence.** Inspect current scheduled/event reconciliation, eligible queue progress, dependency/runtime checks, circuits, budgets, incidents, and owner runbook commands. Configuration gaps remain open work.
- [ ] **Step 6: Audit all requirements and finish only on proof.** Map current authoritative evidence to every R1-R18 row and the user's GitHub-only scope correction. All implemented stages must be merged with required checks and production confirmation. If any required result is missing or indirect, continue work and keep the goal active; otherwise call `update_goal` with `complete`.
