# Failure Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. User selected inline execution with independent branch review on 2026-10-07.

**Goal:** Recover infrastructure interruptions without exhausting valid submissions.

**Architecture:** Pure classifiers and retry planners feed the existing exact-head controller. Structured validation/authority evidence remains separate from workflow conclusions.

**Tech Stack:** Node.js 24, ESM scripts with matching `.d.mts` declarations, TypeScript, Vitest, Playwright, GitHub Actions, GitHub Pages.

**Spec:** [Approved unattended-operation design](../specs/2026-10-07-unattended-operation-design.md).

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

- Cancellation after canonical merge: reconstruction must acknowledge completion rather than publish again.
- Unknown CI failure: bounded retries and an incident cannot imply successful validation.
- Malformed or excessive Retry-After: use bounded delays rather than a busy loop.
- Authority changes during a retry: fail closed for that input.
- Repeated cancellations for seventy-two hours: remain automatically recoverable.

### Task 1: Shared failure and retry contracts

**Files:** Create `scripts/automation/failure.mjs`, `failure.d.mts`, `retry.mjs`, `retry.d.mts`; test `tests/unit/automation-retry.test.ts`.

**Interfaces:** Produce `classifyAutomationFailure({ conclusion?, diagnosticCode?, httpStatus?, validationErrors?, authorizationLost?, superseded? }): AutomationFailure`, with `kind` in transient/configuration/permanent/superseded/unknown. Produce `planAutomationRetry({ failure, transientAttempts, immediateAttempts, nowMs, retryAfterMs?, jitterSeed }): RetryDecision`, containing action, nextEligibleAt, and reasonCode. Declare these shapes in matching declaration files.

- [x] **Step 1: Add the behavioral regression.**

```ts
test("cancellation remains recoverable after seventy-two hours", () => {
  const failure = classifyAutomationFailure({ conclusion: "cancelled" });
  const result = planAutomationRetry({
    failure,
    transientAttempts: 20,
    immediateAttempts: 0,
    nowMs: 72 * 60 * 60_000,
    jitterSeed: "source-42",
  });
  expect(failure.kind).toBe("transient");
  expect(result.action).toBe("retry");
  expect(Date.parse(result.nextEligibleAt!)).toBeGreaterThan(72 * 60 * 60_000);
});
```

- [x] **Step 2: Verify the regression fails.** Run `npx vitest run tests/unit/automation-retry.test.ts`. Expect the stated new assertion to fail or the new import to be missing; distinguish this from unrelated baseline failures.
- [x] **Step 3: Implement the contract.** Use structured reasons before conclusions. Implement the specified delay ladder; cap jitter at ten percent, clamp valid Retry-After to the twenty-four-hour circuit interval, and ignore malformed values. Test deterministic rejection, changed input, skips, cancellation, unknown failures, and exact delay boundaries.
- [x] **Step 4: Verify the regression and relevant existing coverage.** Run `npx vitest run tests/unit/automation-retry.test.ts`; expect exit 0 and all selected tests passing. Check declarations with `npm run typecheck`.
- [x] **Step 5: Review the diff and commit.** Stage only the listed deliverable files and necessary verified generated outputs; use `fix(automation): classify recoverable failures`.

### Task 2: Integrate safe retries into current-head validation

**Files:** Modify `scripts/submissions/project-validation-reconciliation.mjs`, matching `.d.mts`, `reconcile-project-validations.mjs`, and matching `.d.mts`; test `tests/unit/project-validation-reconciliation.test.ts` and `tests/unit/reconcile-project-validations.test.ts`.

**Interfaces:** Consume Task 1 classifier/planner. Preserve `planProjectValidationReconciliation(input)` and exact transaction checks; add optional structured failure/next-eligible inputs and corresponding sanitized state-comment fields without changing transaction schema.

- [ ] **Step 1: Add the behavioral regression.**

```ts
test("cancelled current-head validations do not exhaust allowance", () => {
  const result = planProjectValidationReconciliation(
    input({
      validationRuns: [
        run(3, "cancelled"),
        run(2, "skipped"),
        run(1, "cancelled"),
      ],
    }),
  );
  expect(result.action).not.toBe("block");
  expect(result.attempts).toBe(0);
});
```

- [ ] **Step 2: Verify the regression fails.** Run `npx vitest run tests/unit/project-validation-reconciliation.test.ts tests/unit/reconcile-project-validations.test.ts`. Expect the stated new assertion to fail or the new import to be missing; distinguish this from unrelated baseline failures.
- [ ] **Step 3: Implement the contract.** Replace conclusion-only permanent failure counting. Persist due time and structured reason in bot-owned controller state; wait before due time. Revalidate head, issue, author, authority, auto-publication switch, and active worker before dispatch. Keep modified/manual transactions outside automatic recovery. Add a merge-before-cancellation case that performs no second merge.
- [ ] **Step 4: Verify the regression and relevant existing coverage.** Run `npx vitest run tests/unit/project-validation-reconciliation.test.ts tests/unit/reconcile-project-validations.test.ts`; expect exit 0 and all selected tests passing. Check declarations with `npm run typecheck`.
- [ ] **Step 5: Review the diff and commit.** Stage only the listed deliverable files and necessary verified generated outputs; use `fix(submissions): resume interrupted validation`.

### Task 3: Adversarial recovery and credential lifecycle boundaries

**Files:** Modify `scripts/submissions/project-generation-failure.mjs`, `scripts/submissions/generate-project-submission.mjs`, `scripts/help/generate-project-owner-request.mjs`, their matching `.d.mts`, `.github/workflows/generate-project-submission.yml`, and `.github/workflows/generate-project-owner-request.yml`; test `tests/unit/project-generation-failure.test.ts`, `tests/unit/generate-project-submission.test.ts`, and `tests/unit/automation-recovery-flow.test.ts`.

**Interfaces:** Consume failure/retry contracts. Extend `planProjectGenerationFailure(input): ProjectGenerationFailurePlan` with optional `nowMs` and `transientAttempts` inputs and optional `failure: AutomationFailure` and `nextEligibleAt: string | null` output fields for structured reason codes. Preserve existing callers and Reddit retry state. Token acquisition/publication job separation is implemented in Phase 3; this task makes credential unavailability a dependency circuit rather than content rejection.

- [ ] **Step 1: Add the behavioral regression.**

```ts
test("generation carries a recoverable credential diagnostic", () => {
  const plan = planProjectGenerationFailure({
    issue: issue(["issue-admitted", "project-submission"]),
    producer: "project-submission",
    ownedPull: null,
    runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/7",
    reasonCode: "provider-authentication-failed",
    nowMs: 0,
    transientAttempts: 0,
  });
  expect(plan.failure?.kind).toBe("configuration");
  expect(Date.parse(plan.nextEligibleAt!)).toBeGreaterThan(0);
  expect(plan.labels).not.toContain("submission-rejected");
});
```

- [ ] **Step 2: Verify the regression fails.** Run `npx vitest run tests/unit/project-generation-failure.test.ts tests/unit/generate-project-submission.test.ts tests/unit/automation-recovery-flow.test.ts tests/unit/automation-retry.test.ts`. Expect the stated new assertion to fail or the new import to be missing; distinguish this from unrelated baseline failures.
- [ ] **Step 3: Implement the contract.** Carry safe reason codes across admission/generation boundaries; update the CLI producer and strict diagnostic-artifact allowlist together, falling back to an unknown category for unrecognized errors. Never persist raw secrets or arbitrary error messages. Add a CLI regression proving the provider-authentication code survives preparation failure. Cancellation recovery belongs to Phase 2 because a cancelled worker may never write diagnostics. Exercise changed actor/head after preparation, unknown failure followed by repaired CI, provider recovery after seventy-two simulated hours, and malformed rate-limit metadata. Run relevant existing publication-authority tests.
- [ ] **Step 4: Verify the regression and relevant existing coverage.** Run `npx vitest run tests/unit/project-generation-failure.test.ts tests/unit/generate-project-submission.test.ts tests/unit/automation-recovery-flow.test.ts tests/unit/automation-retry.test.ts`; expect exit 0 and all selected tests passing. Check declarations with `npm run typecheck`.
- [ ] **Step 5: Review the diff and commit.** Stage only the listed deliverable files and necessary verified generated outputs; use `test(automation): cover prolonged recovery`.
