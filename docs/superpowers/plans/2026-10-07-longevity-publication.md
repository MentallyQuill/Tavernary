# Publication and Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution or superpowers:subagent-driven-development if the user selects it. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Publish canonical changes once and confirm safe, recoverable deployments.

**Architecture:** Trusted workers prepare immutable results; one serialized writer rechecks current authority and applies them. A separate exact-revision deployment planner rejects regression and confirms public availability.

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

- Prepared result contains traversal/symlink/unknown paths: reject before extraction or mutation.
- Authority or input changes between preparation and write: regenerate or reject.
- Two requests for the same commit: one deploy and recoverable confirmation.
- Hosted manifest unavailable before deployment: permit validated recovery.
- Rollback target predates an owner delist: deny automatic rollback.

### Task 1: Prepared-result validation and canonical write planning

**Files:** Create `scripts/automation/prepared-result.mjs`, `write-lane.mjs`, matching declarations; test `tests/unit/prepared-result.test.ts` and `tests/unit/automation-write-lane.test.ts`.

**Interfaces:** Produce `validatePreparedResult(result, { operation, run, publisherActorId, currentState }): PreparedResult` and `planCanonicalPublication({ operations, candidates, currentMainSha, expectedPublisherId }): PublicationPlan`. PreparedResult binds operation key, input digest, source identity, producer workflow/run/source SHA, base SHA, allowlisted paths and content hashes. Add `preparedResultFixture(overrides)` and `writeLaneFixture(overrides)` to shared fixtures.

- [ ] **Step 1: Write the failing behavioral test.**

```ts
test("replayed results produce one canonical publication", () => {
  const candidate = preparedResultFixture({});
  const plan = planCanonicalPublication(
    writeLaneFixture({
      candidates: [candidate, candidate],
    }),
  );
  expect(plan.actions).toHaveLength(1);
});
test("prepared traversal is rejected", () => {
  expect(() =>
    validatePreparedResult(
      preparedResultFixture({ paths: ["../outside.json"] }),
      preparedResultContextFixture({}),
    ),
  ).toThrow();
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/prepared-result.test.ts tests/unit/automation-write-lane.test.ts`; expect the new assertion or missing interface to fail, not an unrelated baseline issue.
- [ ] **Step 3: Implement.** Use strict versioned result schemas; verify trusted producer/run origin, normalized paths, content sizes/hashes, immutable identity and policy/input versions. Merge existing project planner checks rather than replacing them. Coalesce compatible snapshots and reject cross-source/authority conflicts. Add source/edit/actor races and already-merged replay tests; add the named context fixture.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/prepared-result.test.ts tests/unit/automation-write-lane.test.ts` and `npm run typecheck`; expect exit 0 and all selected checks passing.
- [ ] **Step 5: Inspect and commit.** Stage the named deliverable only; use `feat(automation): validate canonical write batches`.

### Task 2: Wire one privileged writer and bounded preparation

**Files:** Create `.github/workflows/automation-writer.yml`, `scripts/automation/publish.mjs`, matching `.d.mts`; modify canonical-write workflows and `scripts/catalog/enrichment-orchestrator.mjs`; test `tests/unit/automation-publisher.test.ts` and `tests/unit/automation-workflows.test.ts`.

**Interfaces:** Consume PublicationPlan. Produce `publishCanonicalBatch({ plan, readState, validate, commit, merge, persist, nowMs }): Promise<PublicationResult>`. Preparation returns validated result envelopes or generated PRs; only this writer performs canonical writes.

- [ ] **Step 1: Write the failing behavioral test.**

```ts
test("a cancelled worker after merge does not merge again", async () => {
  const effects = publisherFixture({ alreadyMerged: true });
  await publishCanonicalBatch(effects.input);
  expect(effects.merge).not.toHaveBeenCalled();
  expect(effects.persist).toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/automation-publisher.test.ts tests/unit/automation-workflows.test.ts tests/unit/project-publication-planner.test.ts`; expect the new assertion or missing interface to fail, not an unrelated baseline issue.
- [ ] **Step 3: Implement.** Move refresh, Kit, report, advisory and enrichment main writes behind the shared writer lane. Keep worker output data-only and checkout trusted default-branch code in privileged jobs. Mint fresh scoped App tokens at write time. Bound preparation/checkpoint runs to forty-five minutes and resume from receipts; preserve canary/full rollout approvals. Remove duplicate direct deploy dispatches after writer coverage exists. Update workflow contract tests for the new invariant, not old shell text.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/automation-publisher.test.ts tests/unit/automation-workflows.test.ts tests/unit/project-publication-planner.test.ts` and `npm run typecheck`; expect exit 0 and all selected checks passing.
- [ ] **Step 5: Inspect and commit.** Stage the named deliverable only; use `refactor(automation): serialize canonical publication`.

### Task 3: Exact revision manifest and monotonic deployment

**Files:** Create `scripts/automation/deployment-plan.mjs`, `revision-manifest.mjs`, matching declarations; modify `deploy-pages.yml`, static-export verification, `.gitignore`; test `tests/unit/deployment-plan.test.ts` and `tests/unit/revision-manifest.test.ts`.

**Interfaces:** Produce `planDeployment({ requestedSha, currentMainSha, deployedSha, validatedSha, isAncestor, mode, authorizedRollbackReason? }): DeploymentDecision` and `buildRevisionManifest({ sourceSha, catalog, targets, files, buildId }): RevisionManifest`. Generate `out/revision.json` without hand-editing generated catalog assets.

- [ ] **Step 1: Write the failing behavioral test.**

```ts
test("an older ordinary request cannot replace a descendant", () => {
  const result = planDeployment(
    deploymentFixture({
      requestedSha: "a".repeat(40),
      deployedSha: "b".repeat(40),
      mode: "ordinary",
      isAncestor: (a: string, b: string) => a !== b,
    }),
  );
  expect(result.action).toBe("superseded");
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/deployment-plan.test.ts tests/unit/revision-manifest.test.ts tests/unit/static-export-verification.test.ts`; expect the new assertion or missing interface to fail, not an unrelated baseline issue.
- [ ] **Step 3: Implement.** Bind manifests to exact source and asset hashes, distinguish semantic data identity from volatile build metadata, and recheck deployed ancestry in the final serialized deploy step. Coalesce same-revision requests, recover missed push/dispatch via inventory, and require explicit authorization for rollback. Make old hosted-manifest read advisory while retaining validation of the new artifact. Test missing/timeout/invalid old manifest, duplicate SHA, unknown ancestry, and forged revision metadata.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/deployment-plan.test.ts tests/unit/revision-manifest.test.ts tests/unit/static-export-verification.test.ts` and `npm run typecheck`; expect exit 0 and all selected checks passing.
- [ ] **Step 5: Inspect and commit.** Stage the named deliverable only; use `fix(deploy): prevent stale publication regression`.

### Task 4: Public confirmation and production browser smoke

**Files:** Create `scripts/automation/confirm-deployment.mjs` and matching declaration, `tests/deployment-e2e/public-site.spec.ts`; modify deployment/controller workflows and package scripts; test `tests/unit/deployment-confirmation.test.ts`.

**Interfaces:** Produce `confirmDeployment({ expected, fetchManifest, fetchCatalog, fetchTargets, browserSmoke, nowMs }): Promise<ConfirmationResult>` with confirmed/waiting/incident result. Preserve progress independently from canonical merge and notice delivery.

- [ ] **Step 1: Write the failing behavioral test.**

```ts
test("Pages success with the wrong revision remains unconfirmed", async () => {
  const result = await confirmDeployment(
    confirmationFixture({
      pagesSuccess: true,
      publicSourceSha: "b".repeat(40),
      expectedSourceSha: "a".repeat(40),
    }),
  );
  expect(result.status).toBe("waiting");
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/deployment-confirmation.test.ts`; expect the new assertion or missing interface to fail, not an unrelated baseline issue.
- [ ] **Step 3: Implement.** Validate expected public SHA and catalog/target hashes with bounded polling/backoff. The Playwright smoke covers catalog render/search, creator-source anchor, Kits, and submission/menu routes, with no issue submission or third-party installation. Test eventual propagation, corrupt asset, mismatched schema, broken search and lost confirmation receipt. Production mode targets the fixed Tavernary HTTPS origin; fixture mode uses a local export.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/deployment-confirmation.test.ts` and `npm run typecheck`; expect exit 0 and all selected checks passing.
- [ ] **Step 5: Inspect and commit.** Stage the named deliverable only; use `feat(deploy): confirm public artifact behavior`.

### Task 5: Retained bundles and data-safe rollback

**Files:** Create `scripts/automation/site-bundle.mjs`, `rollback.mjs`, matching declarations and `.github/workflows/restore-site.yml`; test `tests/unit/site-bundle.test.ts` and `tests/unit/rollback-plan.test.ts`.

**Interfaces:** Produce `validateSiteBundle({ manifest, entries, archiveDigest }): VerifiedBundle`, `planRollback({ target, currentCatalogDigest, currentTargetsDigest, ownerTombstones, authorizedReason }): RollbackDecision`. Reject unknown formats, unsafe paths, links, oversized archives, and incompatible canonical data.

- [ ] **Step 1: Write the failing behavioral test.**

```ts
test("rollback cannot resurrect a newly delisted source", () => {
  const result = planRollback(
    rollbackFixture({
      targetListedSources: ["github-42"],
      ownerTombstones: ["github-42"],
    }),
  );
  expect(result.action).toBe("reject");
});
```

- [ ] **Step 2: Verify RED.** Run `npx vitest run tests/unit/site-bundle.test.ts tests/unit/rollback-plan.test.ts`; expect the new assertion or missing interface to fail, not an unrelated baseline issue.
- [ ] **Step 3: Implement.** Retain immutable complete exports and integrity manifests in GitHub: ninety-day workflow artifacts, latest three successful bundles and twelve monthly release assets. Require all current canonical data/target digests and tombstone safety for automatic rollback; otherwise record an owner decision. Provide trusted exact-artifact restore with dry-run verification. Test archive corruption, traversal, symlinks, missing required files and unsupported public schemas.
- [ ] **Step 4: Verify GREEN.** Run `npx vitest run tests/unit/site-bundle.test.ts tests/unit/rollback-plan.test.ts` and `npm run typecheck`; expect exit 0 and all selected checks passing.
- [ ] **Step 5: Inspect and commit.** Stage the named deliverable only; use `feat(deploy): retain verified restore bundles`.
