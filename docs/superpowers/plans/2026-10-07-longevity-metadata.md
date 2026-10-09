# Metadata and Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution or superpowers:subagent-driven-development if the user selects it. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Maintain changed automatic metadata while providers remain optional and spending stays bounded.

**Architecture:** Content fingerprints and manual-field policy feed durable enrichment operations. The writer reserves global budget tickets before workers call primary or repair models; deterministic catalog and scan paths remain available.

**Tech Stack:** Node.js 24, ESM `.mjs`/`.d.mts`, TypeScript, Ajv, Vitest, Playwright, GitHub Actions/Pages/artifacts/releases.

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

- Same source produces identical normalized README: no new model call.
- One field is manual: refresh the other field without overwriting it.
- Two workers reserve the final allowance: only one reservation succeeds.
- Provider errors after reservation: retries and repairs still consume allowance.
- Model/price mismatch or unavailable evidence: preserve trusted facts and identify pending enrichment.

### Task 1: Fingerprint selector and cached results

**Files:** Create `scripts/automation/metadata-refresh.mjs` and matching declaration; modify catalog operation inventory and enrichment policy integration; test `tests/unit/metadata-refresh.test.ts`.

**Interfaces:** Produce `metadataFingerprint({ sourceId, normalizedContent, policyVersion, vocabularyHash }): string` and `selectMetadataRefresh({ records, evidence, cache, nowMs, limit = 10 }): MetadataSelection`. Keep provenance/cache in validated sidecars.

- [ ] **Step 1: Write the failing behavioral test.**

```ts
test("unchanged source and policy uses the validated cache", () => {
  const selection = selectMetadataRefresh(metadataFixture({ unchanged: true }));
  expect(selection.sources).toHaveLength(0);
  expect(selection.modelCalls).toBe(0);
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/metadata-refresh.test.ts tests/unit/enrichment-policy.test.ts tests/unit/enrichment-write-safety.test.ts`; expect the new assertion or missing interface to fail, not an unrelated baseline issue.
- [ ] **Step 3: Implement.** Normalize bounded source evidence, bind cache to source identity and requested independent fields, and prioritize changed/pending sources. Exclude locked fields and unsupported automatic sources. Test a single unlocked field, policy/vocabulary changes, stale identity, >10 candidates and source retrieval failure. Schedule through the common controller rather than a second unbounded rollout.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/metadata-refresh.test.ts tests/unit/enrichment-policy.test.ts tests/unit/enrichment-write-safety.test.ts` and `npm run typecheck`; expect exit 0 and all selected checks passing.
- [ ] **Step 5: Inspect and commit.** Stage the named deliverable only; use `feat(catalog): refresh changed automatic metadata`.

### Task 2: Reserved cross-workflow model budgets

**Files:** Create `scripts/automation/model-budget.mjs` and matching declaration, versioned budget state schema; test `tests/unit/model-budget.test.ts`.

**Interfaces:** Produce `reserveModelBudget(state, { operationKey, requestCount, requestedTokens, model, price? }, { nowMs, requestsPerDay = 40, tokensPerDay = 200000, monthlyUsd? }): BudgetDecision` and `settleModelBudget(state, ticket, usage): BudgetState`. Tickets and reservations are writer-owned, idempotent, and pessimistic when response usage is missing.

- [ ] **Step 1: Write the failing behavioral test.**

```ts
test("forty requests exhaust the shared daily allowance", () => {
  const result = reserveModelBudget(
    budgetFixture({ requestsReserved: 40 }),
    {
      operationKey: "a".repeat(64),
      requestCount: 1,
      requestedTokens: 1000,
      model: "approved",
    },
    { nowMs: 0, requestsPerDay: 40, tokensPerDay: 200000 },
  );
  expect(result.allowed).toBe(false);
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/model-budget.test.ts`; expect the new assertion or missing interface to fail, not an unrelated baseline issue.
- [ ] **Step 3: Implement.** Reserve primary, retry and repair allowance together before dispatch; serialize reservations in the writer. Bound requested tokens conservatively using request content and output caps. Retain spent reservations on unknown/cancelled call outcome. Validate configured prices/model identifiers; fail closed on required price accounting without prices. Test replay, day/month rollover, clock skew, concurrent reservation, repair accounting, malformed usage and optional USD ceiling.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/model-budget.test.ts` and `npm run typecheck`; expect exit 0 and all selected checks passing.
- [ ] **Step 5: Inspect and commit.** Stage the named deliverable only; use `feat(automation): reserve global model allowance`.

### Task 3: Provider circuits and factual fallback

**Files:** Modify `scripts/catalog/enrichment-provider.mjs`, `enrichment-attempts.mjs`, `enrich-readmes.mjs`, `scripts/submissions/draft-project-record.mjs`, `generate-project-submission.mjs` and declarations; test provider, metadata-policy, draft and generation suites.

**Interfaces:** Consume budget tickets and failure circuits before every primary/repair call. Preserve existing provider APIs through optional context arguments. Produce contract-valid provisional copy based on verified source facts; keep missing facts as recoverable pending intake.

- [ ] **Step 1: Write the failing behavioral test.**

```ts
test("provider outage preserves a trusted manual summary", async () => {
  const result = await metadataFlowFixture({
    manualSummary: "Trusted creator description",
    providerUnavailable: true,
  }).run();
  expect(result.record.summary).toBe("Trusted creator description");
  expect(result.record.metadata_policy.summary.mode).toBe("manual");
  expect(result.modelCalls).toBe(0);
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/enrichment-provider.test.ts tests/unit/enrichment-attempts.test.ts tests/unit/enrichment-write-safety.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts`; expect the new assertion or missing interface to fail, not an unrelated baseline issue.
- [ ] **Step 3: Implement.** Carry reservation context through current retry/repair code; cap immediate attempts at three and controller-level delays thereafter. Preserve manual copy/tag authority and existing schema limits. Remove AI-only admission/publication blocking when verified provisional facts suffice, without weakening source or classification contracts. Test absent README, invalid output, unauthenticated provider, unsafe source text, refused budget and already-valid deterministic TavernKeeper import. Extend tests/unit/project-card.test.tsx to verify existing provisional and stale labels against generated output; keep public schemas compatible.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/enrichment-provider.test.ts tests/unit/enrichment-attempts.test.ts tests/unit/enrichment-write-safety.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts` and `npm run typecheck`; expect exit 0 and all selected checks passing.
- [ ] **Step 5: Inspect and commit.** Stage the named deliverable only; use `fix(catalog): preserve useful output during outages`.

### Task 4: Scheduled worker integration and budget visibility

**Files:** Modify `enrich-catalog.yml`, report/advisory workers and common controller; add `tests/unit/metadata-maintenance-flow.test.ts`; update operations runbook.

**Interfaces:** Consume MetadataSelection, BudgetDecision and immutable result envelopes. Scheduled work uses ten-source batches, model concurrency two, validated cached outputs, and the shared writer; manual rollouts obey configured global ceilings.

- [ ] **Step 1: Write the failing behavioral test.**

```ts
test("an exhausted budget delays AI but publishes verified scan facts", async () => {
  const result = await metadataMaintenanceFixture({
    budgetExhausted: true,
  }).run();
  expect(result.scanPublished).toBe(true);
  expect(result.modelCalls).toBe(0);
  expect(result.pendingEnrichment).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/metadata-maintenance-flow.test.ts tests/unit/tavernkeeper-import-state.test.ts tests/unit/tavernkeeper-reports.test.ts tests/unit/tavernkeeper-synthesis.test.ts tests/unit/automation-workflows.test.ts`; expect the new assertion or missing interface to fail, not an unrelated baseline issue.
- [ ] **Step 3: Implement.** Wire controller fingerprints, source requests, reservations, provider probes and sanitized progress. Preserve deterministic scan policy and freshness distinctions. Compare v7/v8 catalog fixtures and consumer behavior contracts; if a schema migration is necessary, document/version it and preserve supported readers before merging. Include lost-event and seventy-two-hour outage recovery through the scheduled worker.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/metadata-maintenance-flow.test.ts tests/unit/tavernkeeper-import-state.test.ts tests/unit/tavernkeeper-reports.test.ts tests/unit/tavernkeeper-synthesis.test.ts tests/unit/automation-workflows.test.ts` and `npm run typecheck`; expect exit 0 and all selected checks passing.
- [ ] **Step 5: Inspect and commit.** Stage the named deliverable only; use `feat(automation): schedule bounded enrichment`.
