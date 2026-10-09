# Durable Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. User selected inline execution with independent branch review on 2026-10-07.

**Goal:** Reconstruct every eligible operation when events or receipts are lost.

**Architecture:** Validated operation identities and receipts are shared across narrow domain adapters. A bounded main-branch controller discovers and dispatches due work from authoritative GitHub/catalog state.

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

- Duplicate and reordered events: one current operation per input fingerprint.
- Inventories exceed one API page: process all candidates fairly.
- Receipt missing after publication: recover from merged PR/canonical data.
- Author edits intake after admission: invalidate prepared work.
- Manual transactions and unverified withdrawal: preserve owner-review state.

### Task 1: Operation identity, receipts, and fixtures

**Files:** Create `scripts/automation/operation.mjs`, `operation.d.mts`, `receipts.mjs`, `receipts.d.mts`, `tests/helpers/automation-fixtures.ts`; test `tests/unit/automation-operation.test.ts`.

**Interfaces:** Produce `operationKey(identity): string`, `validateAutomationReceipt(value): AutomationReceipt`, and `selectDueOperations(operations, { nowMs, limit }): AutomationOperation[]`. Declare identity `{ kind, subject, inputDigest, policyVersion }`, operation `{ key, identity, stage, createdAt, nextEligibleAt, expectedSha, workerRunId, retry }`, and version-1 receipt with meaningful-progress timestamps. Fixtures export `operationFixture(overrides)` and `receiptFixture(overrides)` with fixed valid digests/SHA/time and the same declared types.

- [x] **Step 1: Add the behavioral regression.**

```ts
test("input edits change identity while event replays do not", () => {
  const identity = {
    kind: "project",
    subject: "issue:42",
    inputDigest: "a".repeat(64),
    policyVersion: "1",
  };
  expect(operationKey(identity)).toBe(operationKey({ ...identity }));
  expect(operationKey({ ...identity, inputDigest: "b".repeat(64) })).not.toBe(
    operationKey(identity),
  );
});
```

- [x] **Step 2: Verify the regression fails.** Run `npx vitest run tests/unit/automation-operation.test.ts`. Expect the stated new assertion to fail or the new import to be missing; distinguish this from unrelated baseline failures.
- [x] **Step 3: Implement the contract.** Use stable canonical serialization and SHA-256. Validate schemas and stages strictly; reject path-derived keys and unknown versions. Select oldest due work stably, limit twenty by default, and prevent one active source from monopolizing a pass. Do not store credentials or raw source content in receipts.
- [x] **Step 4: Verify the regression and relevant existing coverage.** Run `npx vitest run tests/unit/automation-operation.test.ts`; expect exit 0 and all selected tests passing. Check declarations with `npm run typecheck`.
- [x] **Step 5: Review the diff and commit.** Stage only the listed deliverable files and necessary verified generated outputs; use `feat(automation): add durable operation contracts`.

### Task 2: Project and owner inventory adapters

**Files:** Create `scripts/automation/project-operations.mjs` and matching `.d.mts`; modify existing admission/generation/controller adapters; test `tests/unit/project-operation-inventory.test.ts`.

**Interfaces:** Consume operation contracts. Produce `discoverProjectOperations({ issues, pulls, runs, receipts, catalog, publisherActorId, nowMs }): AutomationOperation[]`; use existing normalized manifests, transaction parsers, identity/authority checks, and custody markers.

- [ ] **Step 1: Add the behavioral regression.**

```ts
test("lost generation event leaves eligible work discoverable", () => {
  const operations = discoverProjectOperations(
    projectInventoryFixture({
      admittedIssue: true,
      generatedPull: null,
      generationRun: null,
    }),
  );
  expect(operations.map((operation) => operation.stage)).toContain("admitted");
});
```

- [ ] **Step 2: Verify the regression fails.** Run `npx vitest run tests/unit/project-operation-inventory.test.ts`. Expect the stated new assertion to fail or the new import to be missing; distinguish this from unrelated baseline failures.
- [ ] **Step 3: Implement the contract.** Add `projectInventoryFixture(overrides)` to the shared fixtures with a valid admitted project manifest and trusted actor/source. Discover missing admission, generation, validation, publication and finalization independently of prior events. Add >100-item pagination, changed-input, modified-head, closed-issue, owner-request, and already-merged cases.
- [ ] **Step 4: Verify the regression and relevant existing coverage.** Run `npx vitest run tests/unit/project-operation-inventory.test.ts`; expect exit 0 and all selected tests passing. Check declarations with `npm run typecheck`.
- [ ] **Step 5: Review the diff and commit.** Stage only the listed deliverable files and necessary verified generated outputs; use `feat(submissions): reconstruct missing handoffs`.

### Task 3: Kit and withdrawal inventory adapters

**Files:** Create `scripts/automation/kit-operations.mjs` and matching `.d.mts`; integrate `scripts/submissions/kit-submission-reconciliation.mjs`; test `tests/unit/kit-operation-inventory.test.ts`.

**Interfaces:** Produce `discoverKitOperations({ issues, kits, runs, receipts, nowMs }): AutomationOperation[]`. Reuse existing Kit manifest/author/publication checks; add `kitInventoryFixture(overrides)` to shared fixtures.

- [ ] **Step 1: Add the behavioral regression.**

```ts
test("missing finalization is recovered without publishing twice", () => {
  const operations = discoverKitOperations(
    kitInventoryFixture({
      canonicalPublished: true,
      issueOpen: true,
      confirmedDeployment: true,
    }),
  );
  expect(operations.map((operation) => operation.stage)).toContain(
    "deployment-confirmed",
  );
  expect(operations.some((operation) => operation.stage === "validated")).toBe(
    false,
  );
});
```

- [ ] **Step 2: Verify the regression fails.** Run `npx vitest run tests/unit/kit-operation-inventory.test.ts tests/unit/kit-submission-reconciliation.test.ts`. Expect the stated new assertion to fail or the new import to be missing; distinguish this from unrelated baseline failures.
- [ ] **Step 3: Implement the contract.** Reconstruct initial triage, eligible publication, deployment and bookkeeping. Recover lost withdrawal dispatch only after its existing review/authority conditions are met. Test unverified authors, edits, empty Kits, manual review, source deletion, and replayed finalization.
- [ ] **Step 4: Verify the regression and relevant existing coverage.** Run `npx vitest run tests/unit/kit-operation-inventory.test.ts tests/unit/kit-submission-reconciliation.test.ts`; expect exit 0 and all selected tests passing. Check declarations with `npm run typecheck`.
- [ ] **Step 5: Review the diff and commit.** Stage only the listed deliverable files and necessary verified generated outputs; use `feat(kits): reconcile eligible publication`.

### Task 4: Catalog, advisory, scan and deployment inventories

**Files:** Create `scripts/automation/catalog-operations.mjs`, `report-operations.mjs`, `deployment-operations.mjs` with matching `.d.mts`; test `tests/unit/catalog-operation-inventory.test.ts` and `tests/unit/report-operation-inventory.test.ts`.

**Interfaces:** Produce `discoverCatalogOperations({ catalog, evidence, advisoryState, receipts, nowMs })`, `discoverReportOperations({ reportIndex, importState, receipts, nowMs })`, and `discoverDeploymentOperations({ mainCommits, deployments, receipts, nowMs })`, each returning `AutomationOperation[]`.

- [ ] **Step 1: Add the behavioral regression.**

```ts
test("a dropped advisory dispatch is reconstructed before state exists", () => {
  const operations = discoverCatalogOperations(
    catalogInventoryFixture({
      changedEvidence: true,
      advisoryState: [],
      receipts: [],
    }),
  );
  expect(
    operations.some((operation) => operation.identity.kind === "advisory"),
  ).toBe(true);
});
```

- [ ] **Step 2: Verify the regression fails.** Run `npx vitest run tests/unit/catalog-operation-inventory.test.ts tests/unit/report-operation-inventory.test.ts`. Expect the stated new assertion to fail or the new import to be missing; distinguish this from unrelated baseline failures.
- [ ] **Step 3: Implement the contract.** Add corresponding valid inventory fixtures. Use source/evidence/policy fingerprints, due refresh timestamps, immutable report digests, and published commit lineage. Discover stale confirmation and optional work separately from canonical publication. Scan all eligible current evidence rather than only existing unavailable advisory files.
- [ ] **Step 4: Verify the regression and relevant existing coverage.** Run `npx vitest run tests/unit/catalog-operation-inventory.test.ts tests/unit/report-operation-inventory.test.ts`; expect exit 0 and all selected tests passing. Check declarations with `npm run typecheck`.
- [ ] **Step 5: Review the diff and commit.** Stage only the listed deliverable files and necessary verified generated outputs; use `feat(catalog): reconstruct maintenance operations`.

### Task 5: Bounded controller and event wakes

**Files:** Create `scripts/automation/reconcile.mjs`, `reconcile.d.mts`, `.github/workflows/reconcile-automation.yml`; update wake adapters and `package.json`; test `tests/unit/automation-controller.test.ts` and workflow contract tests.

**Interfaces:** Consume all inventory adapters. Produce `reconcileAutomation({ inventory, dispatch, persist, nowMs, limit = 20 }): Promise<ReconciliationResult>` with numeric dispatched, waiting, finished, incidents, and permanentFailures counts; injected adapters make restart tests deterministic.

- [ ] **Step 1: Add the behavioral regression.**

```ts
test("a missed webhook is recovered by the scheduled pass", async () => {
  const result = await reconcileAutomation(
    controllerFixture({ missedWebhook: true }),
  );
  expect(result.dispatched).toBe(1);
  expect(result.permanentFailures).toBe(0);
});
```

- [ ] **Step 2: Verify the regression fails.** Run `npx vitest run tests/unit/automation-controller.test.ts tests/unit/automation-workflows.test.ts`. Expect the stated new assertion to fail or the new import to be missing; distinguish this from unrelated baseline failures.
- [ ] **Step 3: Implement the contract.** Add controller fixtures with recorded dispatch/persist effects. Schedule every fifteen minutes, paginate authoritative inventory, verify active run handles before considering workers abandoned, and dispatch only due stages. Persist meaningful transitions; avoid heartbeat commits and unavailable-dependency self-wake loops. Add CLI dry-run/apply modes and main/trusted-actor guards.
- [ ] **Step 4: Verify the regression and relevant existing coverage.** Run `npx vitest run tests/unit/automation-controller.test.ts tests/unit/automation-workflows.test.ts`; expect exit 0 and all selected tests passing. Check declarations with `npm run typecheck`.
- [ ] **Step 5: Review the diff and commit.** Stage only the listed deliverable files and necessary verified generated outputs; use `feat(automation): reconcile all eligible work`.
