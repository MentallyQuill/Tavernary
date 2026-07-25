# Enrichment Rollout Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brittle all-or-nothing enrichment workflow with a tested, durable orchestrator that preserves valid work, corrects retry defects, and reports isolated project failures without masking systemic failures.

**Architecture:** Keep enrichment generation, validation, reporting, and refresh ownership in their existing focused modules. Add safe provider-envelope normalization, representative canary pooling, explicit failure scopes, multi-project refresh, and a dependency-injected Node orchestrator; reduce GitHub Actions YAML to setup, one orchestrator invocation, and sanitized reporting.

**Tech Stack:** Node.js 24 ESM, TypeScript/Vitest, GitHub Actions YAML, Git, GitHub CLI

## Global Constraints

- Keep raw provider content, README text, prompts, authorization headers, and secrets out of reports and logs.
- Keep the hard maximum at two model calls per project: one primary call and one corrective retry.
- Require at least five validated canary successes from a deterministic pool of at most seven candidates.
- Treat provider configuration, authentication, model mismatch, state corruption, validation, write, publication, and deployment failures as systemic red failures.
- Treat isolated source and exhausted per-project output failures as a durable retry backlog.
- Finish a full rollout with isolated failures as `complete-with-errors`.
- Publish every completed batch before selecting the next batch.
- Restore in-flight registry edits and publish only the sanitized ledger when a batch contains a systemic failure.
- Explicitly dispatch Pages for the exact checkpoint SHA because workflow-token pushes do not trigger another workflow; reuse an existing exact run to avoid duplicates.
- Preserve enrichment's four-field registry write boundary.
- Preserve unrelated changes in the original checkout.

---

### Task 1: Normalize Provider Responses and Make Retry Corrective

**Files:**
- Modify: `scripts/catalog/enrichment-provider.mjs`
- Modify: `scripts/catalog/enrichment-provider.d.mts`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Test: `tests/unit/enrichment-provider.test.ts`
- Test: `tests/unit/enrich-readmes.test.ts`
- Test: `tests/unit/enrich-readmes-cli.test.ts`

**Interfaces:**
- Produces: `parseProviderMessage(message)` returning one JSON object or throwing `EnrichmentProviderError` with a sanitized `diagnosticCode`.
- Produces: retry provider input field `repair: { reasonCode: string, message: string }`.
- Consumes: the prior run-state entry for the selected retry ID.

- [ ] **Step 1: Write failing provider-envelope tests**

Add literal fixtures proving a plain JSON string, an all-text content-parts array, and one whole-response JSON fence parse to the expected object. Add fixtures proving leading prose, a non-text content part, invalid JSON, and a JSON array fail with the expected sanitized diagnostic code.

- [ ] **Step 2: Run the provider tests and verify RED**

Run: `npm.cmd test -- tests/unit/enrichment-provider.test.ts`

Expected: FAIL because `parseProviderMessage` and diagnostic codes do not exist.

- [ ] **Step 3: Implement safe normalization**

Implement `parseProviderMessage(message)` without arbitrary substring extraction. Join textual content parts, remove one whole-response JSON fence, parse once, and require a non-array object. Extend `EnrichmentProviderError` with `diagnosticCode`; keep its public message sanitized.

- [ ] **Step 4: Run the provider tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/enrichment-provider.test.ts`

Expected: PASS.

- [ ] **Step 5: Write a failing corrective-retry test**

Create a retry state whose prior entry is `output-invalid` with `Summary must contain 12-24 words.` Run the next CLI batch with a recording provider and assert its real input contains:

```ts
repair: {
  reasonCode: "output-invalid",
  message: "Summary must contain 12-24 words.",
}
```

- [ ] **Step 6: Run the CLI test and verify RED**

Run: `npm.cmd test -- tests/unit/enrich-readmes-cli.test.ts`

Expected: FAIL because retry context is not passed to the provider.

- [ ] **Step 7: Implement corrective retry input**

Pass each retry ID's prior sanitized entry through `runEnrichmentBatch` into `processProject`. Add only `reasonCode` and `message` to `providerInput.repair`; update the system prompt to explain that the field identifies the defect to correct.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts`

Expected: PASS.

### Task 2: Add Failure Scopes and Warning Completion

**Files:**
- Modify: `scripts/catalog/enrichment-run-state.mjs`
- Modify: `scripts/catalog/enrichment-run-state.d.mts`
- Modify: `scripts/catalog/enrichment-report.mjs`
- Test: `tests/unit/enrichment-run-state.test.ts`
- Test: `tests/unit/enrichment-report.test.ts`

**Interfaces:**
- Produces: `failureScope(reasonCode)` returning `"systemic"` or `"isolated"`.
- Produces: full terminal status `"complete-with-errors"`.
- Consumes: per-entry sanitized `reason_code`.

- [ ] **Step 1: Write failing terminal-state tests**

Add a full run with one `final-failure` carrying `output-invalid` and assert `complete-with-errors`. Add full runs carrying `provider-authentication-failed`, `provider-model-mismatch`, and `write-failed`; assert each becomes `failed`.

- [ ] **Step 2: Run state tests and verify RED**

Run: `npm.cmd test -- tests/unit/enrichment-run-state.test.ts`

Expected: FAIL because all incomplete full runs currently become `failed`.

- [ ] **Step 3: Implement explicit failure scopes**

Export a literal systemic reason-code set. Return `failed` when any terminal entry has a systemic code, `complete-with-errors` for remaining incomplete full runs, and retain strict canary terminal evaluation.

- [ ] **Step 4: Run state tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/enrichment-run-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Add report-schema coverage**

Add a report fixture using `complete-with-errors` and assert validation and sanitized aggregation preserve it.

- [ ] **Step 6: Run report tests and verify RED**

Run: `npm.cmd test -- tests/unit/enrichment-report.test.ts`

Expected: FAIL until the report schema accepts the status.

- [ ] **Step 7: Update report validation and declarations**

Add `complete-with-errors` to the accepted report status union and schema checks without changing entry sanitization.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/enrichment-run-state.test.ts tests/unit/enrichment-report.test.ts`

Expected: PASS.

### Task 3: Use a Deterministic Representative Canary Pool

**Files:**
- Modify: `scripts/catalog/select-enrichment-canary.mjs`
- Modify: `scripts/catalog/enrichment-run-state.mjs`
- Modify: `scripts/catalog/enrichment-run-state.d.mts`
- Test: `tests/unit/select-enrichment-canary.test.ts`
- Test: `tests/unit/enrichment-run-state.test.ts`

**Interfaces:**
- Produces: `selectRepresentativeCanaryIds(records, snapshots, { count?: 7 })`.
- Produces: canary manifest validation accepting five through seven unique IDs.
- Produces: canary success when at least five complete entries have successful terminal outcomes and no systemic failure exists.

- [ ] **Step 1: Write failing selector tests**

Provide hand-built records and snapshots whose IDs prove the selector prioritizes description input, README input, an extension, another kind, then stable alphabetical fill. Assert two calls return the same seven IDs.

- [ ] **Step 2: Run selector tests and verify RED**

Run: `npm.cmd test -- tests/unit/select-enrichment-canary.test.ts`

Expected: FAIL because only random five-record selection exists.

- [ ] **Step 3: Implement representative selection**

Load snapshots with records, choose unique IDs by coverage priority, and fill remaining slots from the alphabetically sorted eligible set. Throw when fewer than five eligible records exist.

- [ ] **Step 4: Run selector tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/select-enrichment-canary.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing canary-pool state tests**

Create a seven-ID canary whose terminal entries contain five successes and two isolated final failures; assert `awaiting-deployment` and successful canary accounting. Create a seven-ID canary with four successes and assert `failed`.

- [ ] **Step 6: Run state tests and verify RED**

Run: `npm.cmd test -- tests/unit/enrichment-run-state.test.ts`

Expected: FAIL because canaries currently require exactly five manifest IDs and five successes.

- [ ] **Step 7: Implement bounded-pool accounting**

Allow five through seven canary IDs, require every pool ID to reach a terminal entry, require at least five successful outcomes, reject systemic failures, and preserve attempt/cursor integrity checks for every pool entry.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/select-enrichment-canary.test.ts tests/unit/enrichment-run-state.test.ts`

Expected: PASS.

### Task 4: Refresh the Canary Pool Atomically

**Files:**
- Modify: `scripts/catalog/refresh-github.mjs`
- Modify: `scripts/catalog/refresh-github.d.mts`
- Test: `tests/unit/incremental-refresh.test.ts`

**Interfaces:**
- Consumes: repeated CLI `--project-id` values.
- Produces: `runRefresh({ mode: "project", projectIds: string[] })` selecting every requested unique project and emitting one manifest.

- [ ] **Step 1: Write a failing multi-project selection test**

Pass three explicit project IDs and assert `selectRefreshRecords` returns those three records in registry order and rejects an unknown ID.

- [ ] **Step 2: Run refresh tests and verify RED**

Run: `npm.cmd test -- tests/unit/incremental-refresh.test.ts`

Expected: FAIL because project mode accepts only one `projectId`.

- [ ] **Step 3: Implement repeated project IDs**

Normalize `projectIds ?? [projectId]`, require at least one unique ID, reject missing requested IDs, and parse every repeated `--project-id` flag in the CLI.

- [ ] **Step 4: Run refresh tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/incremental-refresh.test.ts`

Expected: PASS.

### Task 5: Add the Tested Rollout Orchestrator

**Files:**
- Create: `scripts/catalog/enrichment-orchestrator.mjs`
- Create: `scripts/catalog/enrichment-orchestrator.d.mts`
- Create: `tests/unit/enrichment-orchestrator.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `runEnrichmentRollout(operations)`.
- Consumes operations:

```ts
type RolloutOperations = {
  syncMain(): Promise<void>;
  preflight(): Promise<void>;
  plan(): Promise<{ action: string }>;
  startCanary(): Promise<void>;
  continueCanary(): Promise<void>;
  publishCanaryBatch(): Promise<{ checkpointCommit: string | null; status: string }>;
  canaryCheckpointCommit(): Promise<string | null>;
  fullCheckpointCommit(): Promise<string | null>;
  waitForDeployment(commit: string): Promise<number>;
  approveCanary(commit: string, runId: number): Promise<void>;
  recordFullDeployment(commit: string, runId: number): Promise<void>;
  authorizeFull(): Promise<void>;
  prepareFull(): Promise<void>;
  startFull(): Promise<{ checkpointCommit: string | null; status: string }>;
  resumeFull(): Promise<{ checkpointCommit: string | null; status: string }>;
};
```

- [ ] **Step 1: Write failing sequence tests**

Use a recording operations implementation to prove:

- a fresh run executes preflight, canary batches, one exact deployment wait, approval, full batches, and final deployment wait;
- `continue-canary` skips fresh selection;
- `resume-full` skips canary work;
- `complete-with-errors` resolves successfully;
- `failed` throws;
- a running batch with unchanged progress throws instead of looping.

- [ ] **Step 2: Run orchestrator tests and verify RED**

Run: `npm.cmd test -- tests/unit/enrichment-orchestrator.test.ts`

Expected: FAIL because the orchestrator module does not exist.

- [ ] **Step 3: Implement orchestration state transitions**

Implement the loop entirely against injected operations. Track the most recent
non-null checkpoint commit, recover it from the matching report, and pass that
exact SHA to `waitForDeployment`. Bound loops by requiring each operation to
report changed progress.

- [ ] **Step 4: Run orchestrator tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/enrichment-orchestrator.test.ts`

Expected: PASS.

- [ ] **Step 5: Add production operations**

Implement the CLI operations with `spawn`/`execFile`, existing catalog
commands, atomic report writes, bounded Git fetch/rebase/push, catalog
validation before every checkpoint, full `npm run check` before a registry
publication, durable checkpoint recording, exact `workflow_dispatch` lookup,
one bounded dispatch when absent, and `gh run watch --exit-status`.

- [ ] **Step 6: Exercise the production adapter without external writes**

Run: `npm.cmd run catalog:enrichment-rollout -- --dry-run`

Expected: print the next sanitized action and planned commands without provider, Git, or GitHub mutations.

### Task 6: Reduce GitHub Actions to One Robust Action

**Files:**
- Modify: `.github/workflows/enrich-catalog.yml`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `tests/unit/refresh-github-workflow-safety.test.ts`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**
- Consumes: `npm run catalog:enrichment-rollout`.
- Produces: one serialized workflow dispatch and sanitized report summary.

- [ ] **Step 1: Write failing workflow behavior tests**

Parse the workflow and assert it retains `catalog-refresh` concurrency,
provider/GitHub environment variables, dependency installation, the
orchestrator command, `actions: write`, and the summary step. Assert the
workflow no longer contains inline `publish_changes`, `complete_canary`, or
`finish_full_rollout`. Assert Pages accepts an optional exact `source_sha` and
checks out that SHA.

- [ ] **Step 2: Run workflow tests and verify RED**

Run: `npm.cmd test -- tests/unit/refresh-github-workflow-safety.test.ts tests/unit/workflows.test.ts`

Expected: FAIL because orchestration is still embedded in Bash.

- [ ] **Step 3: Replace the inline state machine**

Keep checkout, Node setup, `npm ci`, required environment variables, and the sanitized summary. Invoke:

```yaml
- name: Run durable enrichment rollout
  run: npm run catalog:enrichment-rollout
```

- [ ] **Step 4: Run workflow tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/refresh-github-workflow-safety.test.ts tests/unit/workflows.test.ts`

Expected: PASS.

### Task 7: Verify the Complete Repair

**Files:**
- Modify only if verification exposes a directly related defect.

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces: fresh deterministic evidence and a reviewable branch.

- [ ] **Step 1: Format changed files**

Run: `npm.cmd run format -- scripts/catalog/enrichment-provider.mjs scripts/catalog/enrichment-provider.d.mts scripts/catalog/enrich-readmes.mjs scripts/catalog/enrichment-run-state.mjs scripts/catalog/enrichment-run-state.d.mts scripts/catalog/enrichment-report.mjs scripts/catalog/select-enrichment-canary.mjs scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts scripts/catalog/enrichment-orchestrator.mjs scripts/catalog/enrichment-orchestrator.d.mts tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-run-state.test.ts tests/unit/enrichment-report.test.ts tests/unit/select-enrichment-canary.test.ts tests/unit/incremental-refresh.test.ts tests/unit/enrichment-orchestrator.test.ts tests/unit/refresh-github-workflow-safety.test.ts tests/unit/workflows.test.ts .github/workflows/enrich-catalog.yml docs/superpowers/specs/2026-07-25-enrichment-rollout-robustness-design.md docs/superpowers/plans/2026-07-25-enrichment-rollout-robustness.md package.json`

- [ ] **Step 2: Run focused tests**

Run: `npm.cmd test -- tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-run-state.test.ts tests/unit/enrichment-report.test.ts tests/unit/select-enrichment-canary.test.ts tests/unit/incremental-refresh.test.ts tests/unit/enrichment-orchestrator.test.ts tests/unit/refresh-github-workflow-safety.test.ts tests/unit/workflows.test.ts`

- [ ] **Step 3: Run the complete repository gate**

Run: `npm.cmd run check`

- [ ] **Step 4: Inspect the final patch**

Run: `git diff --check` and `git status --short`.

- [ ] **Step 5: Review for failure-path regressions**

Confirm no raw provider data is persisted, every loop is bounded, every completed batch is checkpointed before continuation, only exact push-triggered deployments are awaited, and unrelated source files remain untouched.
