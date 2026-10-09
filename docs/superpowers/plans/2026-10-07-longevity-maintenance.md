# Maintenance and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution or superpowers:subagent-driven-development if selected. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Finish safe dependency updates, observe progress within GitHub, and maintain bounded recoverable state.

**Architecture:** Trusted maintenance proposals use the common writer and deployment verification. Shared health and retention planners produce deduplicated incidents and safe cleanup; a GitHub-hosted restore drill verifies retained bundles.

**Tech Stack:** Node.js, ESM declarations, TypeScript, Vitest, Playwright, GitHub CLI/Actions/Pages/artifacts/releases.

**Spec:** [Approved design](../specs/2026-10-07-unattended-operation-design.md).

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

- Dependency author looks like a bot but identity differs: deny automatic merge.
- Permission/workflow policy changes accompany a patch update: require owner review.
- A scheduled pass is delayed: distinguish unavailable scheduling from invalid content.
- Old terminal receipt protects a pending restore: retain it.
- Restore bundle is present but unusable offline: fail the drill and preserve evidence.

### Task 1: Gated dependency completion

**Files:** Create `scripts/automation/dependency-update.mjs`, matching `.d.mts`, maintenance workflow adapters; modify `.github/dependabot.yml`; test `tests/unit/dependency-update.test.ts` and workflow contracts.

**Interfaces:** Produce `planDependencyUpdate({ pull, metadata, files, checks, currentMainSha, allowedPackages }): DependencyDecision`. Trusted patch/minor transactions bind author identity, update provenance, package group, exact checked head, clean base and an allowlisted diff. Actions pins retain provenance and unchanged permission policy.

- [ ] **Step 1: Add the failing behavioral test.**

```ts
test("a patch update cannot smuggle workflow permissions", () => {
  const result = planDependencyUpdate(
    dependencyFixture({
      updateType: "version-update:semver-patch",
      changedFiles: ["package-lock.json", ".github/workflows/ci.yml"],
      permissionsChanged: true,
    }),
  );
  expect(result.action).toBe("owner-review");
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/dependency-update.test.ts tests/unit/automation-workflows.test.ts`; expect the new behavior/import to fail, and identify unrelated baseline failures separately.
- [ ] **Step 3: Implement.** Group Next.js/ESLint config, React/DOM, and compatible tooling. Require complete verify/visual/browser/build evidence for the exact head. Produce only eligible maintenance plans for the shared writer; untrusted authors, major package updates, expanded paths and permissions stay manual. Add failed-check, stale-head, forged bot, security update and post-deployment failure cases.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/dependency-update.test.ts tests/unit/automation-workflows.test.ts` and `npm run typecheck`; expect exit 0.
- [ ] **Step 5: Review and commit.** Stage the named deliverable; use `feat(maintenance): gate dependency publication`.

### Task 2: Supported runtime transition policy

**Files:** Create `config/supported-runtimes.json`, `scripts/automation/runtime-policy.mjs`, matching `.d.mts`; modify engines, workflow runtime adapters and documentation only through a verified transition; test `tests/unit/runtime-policy.test.ts`.

**Interfaces:** Produce `planRuntimeTransition({ supported, officialSchedule, candidateResults, nowMs }): RuntimeDecision`. Initial production runtime is Node 24; official release data comes from the Node Release repository on GitHub. A transition proposal declares all coupled engine/workflow/type/documentation changes.

- [ ] **Step 1: Add the failing behavioral test.**

```ts
test("an end-of-life runtime without a verified successor needs an incident", () => {
  const result = planRuntimeTransition(
    runtimeFixture({
      nowMs: Date.parse("2028-05-01T00:00:00Z"),
      supportedMajor: 24,
      verifiedSuccessor: false,
    }),
  );
  expect(result.action).toBe("incident");
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/runtime-policy.test.ts`; expect the new behavior/import to fail, and identify unrelated baseline failures separately.
- [ ] **Step 3: Implement.** Validate release-schedule schema and dates, test current and next stable LTS candidates with full CI, and warn ninety days before support ends if no verified transition is available. Generate a constrained transition PR; activate only stable supported candidates whose complete coupled diff passes. Reject malformed schedule, missing matrix results and permission changes. Keep the working runtime/artifact while an upgrade fails; do not mark an unsupported runtime healthy.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/runtime-policy.test.ts` and `npm run typecheck`; expect exit 0.
- [ ] **Step 5: Review and commit.** Stage the named deliverable; use `feat(maintenance): verify runtime transitions`.

### Task 3: GitHub operational incidents

**Files:** Create `scripts/automation/health.mjs`, `incidents.mjs`, matching declarations; integrate controller summaries and maintenance issues; test `tests/unit/automation-health.test.ts` and `tests/unit/automation-incidents.test.ts`; update runbook.

**Interfaces:** Produce `assessAutomationHealth({ operations, refreshState, importState, deploymentState, circuits, budget, nowMs }): HealthFinding[]` and `planIncidentUpdates({ findings, existingIssues }): IncidentMutation[]`. Incident identity is sanitized dependency/operation fingerprint.

- [ ] **Step 1: Add the failing behavioral test.**

```ts
test("manual waits are not stalled automatic submissions", () => {
  const findings = assessAutomationHealth(
    healthFixture({
      manualPublication: true,
      noProgressForHours: 72,
    }),
  );
  expect(
    findings.some((finding) => finding.code === "submission-stalled"),
  ).toBe(false);
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/automation-health.test.ts tests/unit/automation-incidents.test.ts`; expect the new behavior/import to fail, and identify unrelated baseline failures separately.
- [ ] **Step 3: Implement.** Use forty-eight-hour refresh, twenty-four-hour due import and two-hour eligible submission thresholds. Check revision/queue/circuit/budget/token state and unknown failures. Create one incident per fingerprint, update only material changes, and close only on verified recovery. Test stale schedules, page lag, credential failure, redacted diagnostics, repeated identical findings and dependency recovery. Describe the GitHub-only outage/inactivity limitation clearly.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/automation-health.test.ts tests/unit/automation-incidents.test.ts` and `npm run typecheck`; expect exit 0.
- [ ] **Step 5: Review and commit.** Stage the named deliverable; use `feat(automation): report persistent operational incidents`.

### Task 4: Retention and offline restore drills

**Files:** Create `scripts/automation/retention.mjs`, matching declaration, `.github/workflows/restore-drill.yml`; test `tests/unit/automation-retention.test.ts` and `tests/deployment-e2e/restore-bundle.spec.ts`; update runbook.

**Interfaces:** Produce `planAutomationRetention({ receipts, bundles, pendingRestores, canonicalEvidence, nowMs }): RetentionPlan`. Consume verified bundle and revision contracts. Terminal receipts require ninety-day age plus durable completion evidence; pending work and tombstones remain.

- [ ] **Step 1: Add the failing behavioral test.**

```ts
test("old state needed by a pending restore is retained", () => {
  const plan = planAutomationRetention(
    retentionFixture({
      terminalAgeDays: 120,
      pendingRestore: true,
    }),
  );
  expect(plan.removeReceipts).toHaveLength(0);
  expect(plan.removeBundles).toHaveLength(0);
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/automation-retention.test.ts tests/unit/site-bundle.test.ts`; expect the new behavior/import to fail, and identify unrelated baseline failures separately.
- [ ] **Step 3: Implement.** Retain latest three and twelve monthly verified GitHub bundles; prune only after replacement verification. Weekly restore drill downloads a verified bundle, validates integrity, serves locally and runs browser smoke with external/provider requests blocked. Test expiration, missing canonical evidence, pending receipts, tombstones, unavailable replacement, corrupted archive and clean offline restore. Document trusted recovery/rollback commands, token repair, switches and manual exceptions.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/automation-retention.test.ts tests/unit/site-bundle.test.ts` and `npm run typecheck`; expect exit 0.
- [ ] **Step 5: Review and commit.** Stage the named deliverable; use `feat(maintenance): drill bounded artifact recovery`.
