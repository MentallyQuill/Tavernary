# Enrichment False-Success Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a full catalog enrichment run prepares repository identities before model work and cannot finish successfully while any manifest record remains unenriched.

**Architecture:** Reuse the existing repository-identity backfill and bounded publication path before initializing a full rollout. Tighten the enrichment state machine so only enriched or confirmed-fallback outcomes produce `status: complete`; source-readiness failures, skipped records, and exhausted retries produce `status: failed`, which the workflow already rejects.

**Tech Stack:** GitHub Actions YAML, Node.js 24, Vitest, TypeScript tests

## Global Constraints

- Preserve enrichment's four-field editorial write boundary.
- Do not invent repository identities; use validated healthy snapshots.
- Preserve partial batch publication so paid successful calls are not lost.
- Treat `enriched`, `fallback`, `retry-enriched`, and `retry-fallback` as successful terminal outcomes.
- Keep the existing five-card canary and exact-model gate.

---

### Task 1: Fail incomplete full rollouts

**Files:**
- Modify: `tests/unit/enrichment-run-state.test.ts`
- Modify: `scripts/catalog/enrichment-run-state.mjs`

**Interfaces:**
- Consumes: `applyAttemptResults(state, results, now)`
- Produces: terminal full-rollout status of `complete` only when every manifest entry has a successful terminal outcome; otherwise `failed`

- [ ] **Step 1: Write the failing state-machine tests**

Change the exhausted-retry expectation from `complete` to `failed`, then add a focused full-rollout test:

```ts
test("fails a full rollout containing source-not-ready entries", () => {
  const initial = createEnrichmentRunState({
    mode: "full",
    manifest: ["a", "b"],
    runId: "run-1",
    now,
  });
  const state = applyAttemptResults(
    initial,
    [
      { id: "a", phase: "primary", outcome: "enriched" },
      { id: "b", phase: "primary", outcome: "source-not-ready" },
    ],
    later,
  );

  expect(state).toMatchObject({
    status: "failed",
    phase: "complete",
    aggregates: { enriched: 1, "source-not-ready": 1 },
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/enrichment-run-state.test.ts
```

Expected: FAIL because full-mode `terminalState` currently always returns `complete`.

- [ ] **Step 3: Implement the minimum terminal-state rule**

Update `terminalState` to return `complete` or `awaiting-deployment` only when every entry outcome is one of:

```js
["enriched", "fallback", "retry-enriched", "retry-fallback"]
```

Return `failed` for every other completed full or canary state.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- --run tests/unit/enrichment-run-state.test.ts
```

Expected: all enrichment state-machine tests pass.

### Task 2: Prepare identities before full initialization

**Files:**
- Modify: `tests/unit/refresh-github-workflow-safety.test.ts`
- Modify: `.github/workflows/enrich-catalog.yml`

**Interfaces:**
- Consumes: `npm run catalog:backfill-identities -- --write` and `publish_changes`
- Produces: `prepare_full_rollout`, invoked immediately before `run_batch start`

- [ ] **Step 1: Write the failing workflow contract**

Add assertions that:

```ts
expect(source).toContain("prepare_full_rollout()");
expect(fullStartBranch.indexOf("prepare_full_rollout")).toBeLessThan(
  fullStartBranch.indexOf("run_batch start"),
);
expect(fullPreparation).toContain(
  "npm run catalog:backfill-identities -- --write",
);
expect(fullPreparation).toContain("npm run catalog:validate");
expect(fullPreparation).toContain(
  'publish_changes "chore(catalog): prepare full enrichment rollout"',
);
```

- [ ] **Step 2: Run the workflow test and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: FAIL because full `start` currently initializes enrichment without identity preparation.

- [ ] **Step 3: Implement full preparation**

Add:

```bash
prepare_full_rollout() {
  npm run catalog:backfill-identities -- --write
  npm run catalog:validate
  publish_changes "chore(catalog): prepare full enrichment rollout"
}
```

Call `prepare_full_rollout` immediately before `run_batch start`. The existing bounded fetch/rebase/check/push path publishes the identity-only registry changes before the stable manifest is initialized.

- [ ] **Step 4: Run the workflow test and verify GREEN**

Run:

```powershell
npm.cmd test -- --run tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: all workflow safety tests pass.

### Task 3: Verify the complete repair

**Files:**
- Verify only

**Interfaces:**
- Consumes: Tasks 1 and 2
- Produces: fresh repository evidence

- [ ] **Step 1: Run focused regression tests**

```powershell
npm.cmd test -- --run tests/unit/enrichment-run-state.test.ts tests/unit/refresh-github-workflow-safety.test.ts tests/unit/enrich-readmes-cli.test.ts
```

- [ ] **Step 2: Run the complete repository gate**

```powershell
npm.cmd run check
```

- [ ] **Step 3: Inspect the final diff**

```powershell
git diff --check
git diff -- .github/workflows/enrich-catalog.yml scripts/catalog/enrichment-run-state.mjs tests/unit/enrichment-run-state.test.ts tests/unit/refresh-github-workflow-safety.test.ts
```

Confirm the changes are limited to full-rollout preparation, terminal success semantics, and their regression coverage.
