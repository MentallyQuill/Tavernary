# Unified Enrichment Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manually ordered enrichment modes with one self-resuming rollout that preserves canary authorization independently from full-run progress and never reports unresolved projects as success.

**Architecture:** Store canary state in `data/reports/enrichment-canary.json` and full-run state in `data/reports/enrichment-report.json`. A pure rollout planner inspects those ledgers, the configured model, and the current eligible-project count; the GitHub Actions workflow follows that plan to preflight, recover or run the canary, authorize preparation, and start or resume the full rollout.

**Tech Stack:** Node.js 24 ESM, TypeScript/Vitest tests, GitHub Actions YAML, Bash, jq, GitHub CLI.

## Global Constraints

- Preserve unrelated dirty UI and Kits changes.
- Keep all catalog writers in the `catalog-refresh` concurrency group with `cancel-in-progress: false`.
- Require provider preflight and a deployed five-project canary before full source preparation.
- Use the same configured model for the canary and full rollout.
- Treat any `source-not-ready` or terminal enrichment failure as a failed rollout.
- Keep provider secrets and raw provider content out of reports and workflow summaries.

---

### Task 1: Separate Canary Authorization From Full Progress

**Files:**
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Test: `tests/unit/enrich-readmes-cli.test.ts`

**Interfaces:**
- Consumes: existing `runCli(options)` modes and `assertFullRolloutAllowed`.
- Produces: `canaryReportPath` option and `--canary-report-path` CLI flag; canary and approval modes use the canary ledger, while start and resume use the full ledger.

- [ ] **Step 1: Write the failing test**

Add a test that approves a canary into a temporary `enrichment-canary.json`, starts a full rollout into a separate `enrichment-report.json`, and asserts that the canary file remains `passed` after the full report becomes `full`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/unit/enrich-readmes-cli.test.ts`

Expected: FAIL because all modes currently read and overwrite one report path.

- [ ] **Step 3: Write minimal implementation**

Resolve two paths in `runCli`:

```js
const fullReportPath = options.reportPath ?? defaultFullReportPath;
const canaryReportPath =
  options.canaryReportPath ?? defaultCanaryReportPath;
```

Read/write the canary path for `canary` and `approve-canary`; authorize `start` from the canary path; read/write the full path for `start` and `resume`. Parse both CLI path flags.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/unit/enrich-readmes-cli.test.ts`

Expected: PASS.

### Task 2: Add a Deterministic Recovery Planner

**Files:**
- Create: `scripts/catalog/enrichment-rollout-plan.mjs`
- Create: `scripts/catalog/enrichment-rollout-plan.d.mts`
- Test: `tests/unit/enrichment-rollout-plan.test.ts`

**Interfaces:**
- Consumes: full report, canary report, configured model, and eligible-project count.
- Produces: `planEnrichmentRollout(input)` returning one of `complete`, `resume-full`, `start-canary`, `continue-canary`, `deploy-canary`, or `start-full`.

- [ ] **Step 1: Write the failing test**

Cover these literal decisions one at a time:

```ts
expect(planEnrichmentRollout({ fullReport: runningFull, eligibleCount: 10, model }))
  .toEqual({ action: "resume-full" });
expect(planEnrichmentRollout({ fullReport: completeFull, canaryReport: passedCanary, eligibleCount: 10, model }))
  .toEqual({ action: "start-full" });
expect(planEnrichmentRollout({ eligibleCount: 0, model }))
  .toEqual({ action: "complete" });
```

Also require fresh canary selection when authorization is absent or model-mismatched, and reject fewer than five candidates.

- [ ] **Step 2: Run each test to verify it fails**

Run: `npm.cmd test -- tests/unit/enrichment-rollout-plan.test.ts`

Expected: FAIL because the planner does not exist.

- [ ] **Step 3: Write minimal implementation**

Validate report modes/statuses and return the single next action. A running full report takes precedence; zero candidates complete without paid work; a valid passed canary authorizes start; recoverable canary states continue; otherwise require at least five candidates and start a new canary.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/unit/enrichment-rollout-plan.test.ts`

Expected: PASS.

### Task 3: Replace Manual Modes With One Workflow

**Files:**
- Modify: `.github/workflows/enrich-catalog.yml`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**
- Consumes: the two report files and planner action.
- Produces: one normal workflow dispatch that preflights, resumes or runs the canary, authorizes full preparation, and starts or resumes full enrichment.

- [ ] **Step 1: Write the failing workflow-contract test**

Parse the YAML and assert:

```ts
expect(inputs).not.toHaveProperty("mode");
expect(source).toContain("enrichment-canary.json");
expect(source).toContain("catalog:enrichment-plan");
expect(source).toContain("--mode preflight");
expect(source).toContain("--mode authorize-full");
```

Assert both reports are staged and the workflow retains serialized catalog concurrency.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/unit/workflows.test.ts`

Expected: FAIL because the workflow still exposes four manual modes and one shared report.

- [ ] **Step 3: Write minimal implementation**

Add an `authorize-full` no-write CLI mode and a package script for the planner. Rewrite the workflow so one dispatch:

1. runs provider preflight;
2. asks the planner for the next action;
3. resumes a running full rollout immediately;
4. otherwise completes or recovers the canary;
5. validates canary authorization before full preparation;
6. starts the full rollout and continues fixed batches until terminal;
7. fails unless the terminal status is `complete`.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-rollout-plan.test.ts tests/unit/workflows.test.ts`

Expected: PASS.

### Task 4: Verify the Repair

**Files:**
- Modify only if verification exposes a directly related defect.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: evidence that the repair is safe to publish.

- [ ] **Step 1: Run formatting and static checks**

Run: `npm.cmd run format -- .github/workflows/enrich-catalog.yml scripts/catalog/enrich-readmes.mjs scripts/catalog/enrichment-rollout-plan.mjs scripts/catalog/enrichment-rollout-plan.d.mts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-rollout-plan.test.ts tests/unit/workflows.test.ts docs/superpowers/plans/2026-07-25-unified-enrichment-rollout.md`

- [ ] **Step 2: Run the focused test suite**

Run: `npm.cmd test -- tests/unit/enrichment-run-state.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-rollout-plan.test.ts tests/unit/workflows.test.ts`

- [ ] **Step 3: Run the repository gate**

Run: `npm.cmd run check`

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check` and `git diff -- .github/workflows/enrich-catalog.yml scripts/catalog/enrich-readmes.mjs scripts/catalog/enrichment-rollout-plan.mjs scripts/catalog/enrichment-rollout-plan.d.mts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-rollout-plan.test.ts tests/unit/workflows.test.ts docs/superpowers/plans/2026-07-25-unified-enrichment-rollout.md`

