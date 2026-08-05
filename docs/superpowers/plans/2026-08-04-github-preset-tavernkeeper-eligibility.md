# GitHub Preset TavernKeeper Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every published, active, healthy GitHub repository eligible for TavernKeeper scanning regardless of whether its Tavernary card is an extension, frontend, or preset.

**Architecture:** Tavernary remains the eligibility authority and continues publishing exact-SHA repository targets. Remove only the obsolete preset-kind exclusions at the manifest, catalog-status, and staff-resolver boundaries; keep every existing repository identity, source health, authorization, and exact-SHA guard. TavernKeeper already accepts `preset` targets, so no cross-repository scanner code or report-contract change is required.

**Tech Stack:** TypeScript, Node.js ESM, Vitest, Next.js static export, GitHub Actions.

## Global Constraints

- Scan the entire exact-SHA GitHub repository for presets through the existing TavernKeeper pipeline.
- Project kind must not determine eligibility.
- Non-GitHub URLs, Codeberg, GitHub organization pages without one repository identity, inactive sources, unhealthy or stale snapshots, identity mismatches, and malformed SHAs remain ineligible.
- Do not add arbitrary clone URLs, user-selected branches, scan modes, or repository execution.
- Preserve advisory scan language, immutable report identity, queue behavior, and report schemas.

---

### Task 1: Publish preset repositories in the target manifest

**Files:**
- Modify: `tests/unit/tavernkeeper-targets.test.ts:257-325`
- Modify: `scripts/security/tavernkeeper-targets.mjs:12-65`

**Interfaces:**
- Consumes: `buildTavernKeeperTargets(...)` with V2 or V3 project metadata.
- Produces: V3 repository entries whose sorted `project_kinds` may be `["preset"]` or include `preset` alongside other card kinds.

- [ ] **Step 1: Write failing target-manifest tests**

Change the shared-source expectation to retain both kinds and the earliest catalog date:

```ts
expect(manifest.repositories[0]).toMatchObject({
  project_kinds: ["extension", "preset"],
  catalog_priority: {
    first_cataloged_at: "2026-07-01T00:00:00.000Z",
  },
});
```

Replace the preset-omission test with a V3 preset-only behavior test using `rankedProjectIds: ["preset-card"]` and assert the hand-derived repository entry:

```ts
expect(manifest.repositories).toEqual([
  {
    source_id: "github-42",
    provider: "github",
    repository_id: 42,
    repository: "owner/preset",
    target_sha: "a".repeat(40),
    canonical_url: "https://github.com/owner/preset",
    project_kinds: ["preset"],
    catalog_priority: {
      top_30: true,
      first_cataloged_at: "2026-07-01T00:00:00.000Z",
      popularity_rank: 1,
    },
  },
]);
```

- [ ] **Step 2: Run the manifest test and verify RED**

Run: `npm.cmd test -- tests/unit/tavernkeeper-targets.test.ts`

Expected: FAIL because preset metadata is discarded and the preset-only repository is omitted.

- [ ] **Step 3: Implement the minimal manifest change**

Delete `supportedProjectKinds` and the `continue` that drops valid preset project metadata. Keep `validProjectKinds`, publication filtering, source/snapshot identity checks, deduplication, and ranking unchanged.

- [ ] **Step 4: Run the manifest test and verify GREEN**

Run: `npm.cmd test -- tests/unit/tavernkeeper-targets.test.ts`

Expected: all target-manifest tests pass.

### Task 2: Treat GitHub-backed preset cards as scan-eligible

**Files:**
- Modify: `tests/unit/tavernkeeper-status.test.ts:59-166`
- Modify: `src/features/catalog/tavernkeeper-status.ts:201-216`
- Modify: `scripts/catalog/build.mjs:427-433`
- Modify: `tests/unit/build-catalog.test.ts:222-377`

**Interfaces:**
- Consumes: an active GitHub source, optional current snapshot, assessed reports, and preferred report IDs.
- Produces: the existing gray/current/stale/unavailable/risk-colored `TavernKeeperCardStatus` without a project-kind override.

- [ ] **Step 1: Write failing card-status tests**

Add a helper that passes `projectKind: "preset"` to the current function, then assert observable behavior:

```ts
expect(derivePreset(null)).toMatchObject({
  state: "gray",
  freshness: "unassessed",
  currentSha,
});
expect(derivePreset(report())).toMatchObject({
  state: "teal",
  freshness: "current",
  report: expect.objectContaining({ scannedSha: currentSha }),
});
expect(derivePreset(report({ target_sha: olderSha }))).toMatchObject({
  state: "teal",
  freshness: "stale",
});
expect(
  derivePreset(null, { ...snapshot, source_health: "unavailable" }),
).toMatchObject({ state: "gray", freshness: "unavailable" });
```

Keep a separate test proving a Codeberg source remains fully unsupported. Update the sibling extension/preset catalog test so both cards project the same assessment instead of the preset being unsupported.

- [ ] **Step 2: Run the status and catalog tests and verify RED**

Run: `npm.cmd test -- tests/unit/tavernkeeper-status.test.ts tests/unit/build-catalog.test.ts`

Expected: FAIL because `projectKind === "preset"` short-circuits to unsupported.

- [ ] **Step 3: Implement the minimal status change**

Remove `projectKind` from the `deriveTavernKeeperCardStatus` parameter and type contract, remove the preset branch from the unsupported guard, and stop passing `record.kind` from `buildCatalog`. Leave `isActiveGithubSource`, report identity, scanner policy, freshness, and history logic unchanged.

- [ ] **Step 4: Run the status and catalog tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/tavernkeeper-status.test.ts tests/unit/build-catalog.test.ts`

Expected: both files pass with GitHub presets using normal scan states and non-GitHub sources remaining unsupported.

### Task 3: Accept presets in protected targeted scans

**Files:**
- Modify: `tests/unit/resolve-tavernkeeper-scan-request.test.ts:34-79`
- Modify: `scripts/security/resolve-tavernkeeper-scan-request.mjs:7-54`

**Interfaces:**
- Consumes: one canonical GitHub repository URL, an authorized numeric actor ID, source records, and published project records.
- Produces: `{ sourceId, repositoryId, repositoryUrl }` for any active published project kind backed by the registered repository.

- [ ] **Step 1: Write a failing preset-resolution test**

Move the preset case out of the rejection table and assert the real resolver output:

```ts
test("accepts a published preset repository", () => {
  expect(
    resolve({ projects: [{ ...recursionProject, kind: "preset" }] }),
  ).toEqual({
    sourceId: recursionSource.id,
    repositoryId: recursionSource.repository_id,
    repositoryUrl: "https://github.com/MentallyQuill/Recursion",
  });
});
```

- [ ] **Step 2: Run the resolver test and verify RED**

Run: `npm.cmd test -- tests/unit/resolve-tavernkeeper-scan-request.test.ts`

Expected: FAIL with the published-project rejection because presets are filtered out.

- [ ] **Step 3: Implement the minimal resolver change**

Delete `supportedProjectKinds` and filter published source IDs only by `project.listing_status === "active"`. Retain actor authorization, exact canonical URL validation, active GitHub source checks, positive repository identity, registered source ID shape, and canonical URL equality.

- [ ] **Step 4: Run the resolver test and verify GREEN**

Run: `npm.cmd test -- tests/unit/resolve-tavernkeeper-scan-request.test.ts`

Expected: all resolver tests pass.

### Task 4: Update normative and historical documentation

**Files:**
- Modify: `docs/tavernkeeper-integration.md:52-65`
- Modify: `docs/tavernkeeper-live-acceptance.md:1-6`
- Reference: `docs/superpowers/specs/2026-08-04-github-preset-tavernkeeper-eligibility-design.md`

**Interfaces:**
- Consumes: approved source-based eligibility design.
- Produces: current integration guidance plus an explicit supersession note on the historical canary record.

- [ ] **Step 1: Update current integration guidance**

Describe the schema-version-3 manifest, exact source-health/identity boundary, and eligibility for published extension, frontend, and preset cards. State that eligible preset targets scan the entire repository.

- [ ] **Step 2: Preserve history while marking the old policy obsolete**

Add a dated note near the top of `docs/tavernkeeper-live-acceptance.md` linking to the new design and explaining that the recorded preset exclusion was superseded; do not rewrite the historical canary events.

- [ ] **Step 3: Format and inspect the complete diff**

Run: `npm.cmd exec prettier -- --write scripts/security/tavernkeeper-targets.mjs scripts/security/resolve-tavernkeeper-scan-request.mjs src/features/catalog/tavernkeeper-status.ts scripts/catalog/build.mjs tests/unit/tavernkeeper-targets.test.ts tests/unit/tavernkeeper-status.test.ts tests/unit/resolve-tavernkeeper-scan-request.test.ts tests/unit/build-catalog.test.ts docs/tavernkeeper-integration.md docs/tavernkeeper-live-acceptance.md docs/superpowers/specs/2026-08-04-github-preset-tavernkeeper-eligibility-design.md docs/superpowers/plans/2026-08-04-github-preset-tavernkeeper-eligibility.md`

Run: `git diff --check && git diff --stat && git diff`

Expected: no whitespace errors and only the approved eligibility, tests, and documentation paths change.

- [ ] **Step 4: Commit the implementation**

```text
fix(security): scan GitHub preset repos

Replace the obsolete kind-based exclusion with the existing active,
healthy, exact-SHA GitHub repository boundary.
```

### Task 5: Verify generated production coverage and the full gate

**Files:**
- Generated and ignored: `public/security/tavernkeeper-targets.json`
- Generated and ignored: `src/generated/catalog.json`

**Interfaces:**
- Consumes: current registry projects, sources, snapshots, and TavernKeeper contract configuration.
- Produces: a validated V3 target manifest and complete Tavernary verification evidence.

- [ ] **Step 1: Run all focused regression tests together**

Run: `npm.cmd test -- tests/unit/tavernkeeper-targets.test.ts tests/unit/tavernkeeper-status.test.ts tests/unit/resolve-tavernkeeper-scan-request.test.ts tests/unit/build-catalog.test.ts`

Expected: all focused tests pass with zero failures.

- [ ] **Step 2: Build and inspect the production manifest**

Run: `npm.cmd run catalog:build`

Parse `public/security/tavernkeeper-targets.json` and compare it to active published preset records plus source/snapshot identity. Assert that every active, healthy, non-stale, exact-SHA GitHub preset repository is present with `project_kinds` containing `preset`; print the repository count and any missing repositories.

Expected: zero missing eligible preset repositories.

- [ ] **Step 3: Run the complete repository gate**

Run: `npm.cmd run check`

Expected: formatting, lint, palette audit, catalog validation, security report validation, catalog build, typecheck, all Vitest tests, production build, and static-export verification pass.

- [ ] **Step 4: Confirm branch scope and commit state**

Run: `git status --short && git diff origin/main...HEAD --stat && git log --oneline origin/main..HEAD`

Expected: clean status and only the design, plan, eligibility implementation, regression tests, and documentation commits.

### Task 6: Publish, review, merge, and verify production handoff

**Files:**
- No new source files.

**Interfaces:**
- Consumes: verified feature branch.
- Produces: merged PR, exact merged SHA, deployed Tavernary manifest, and a TavernKeeper reconciliation attempt that sees preset targets.

- [ ] **Step 1: Push the feature branch**

Run: `git push -u origin codex/github-preset-tavernkeeper-scans`

- [ ] **Step 2: Open a ready PR**

Create a PR titled `fix(security): scan GitHub preset repositories` with the policy rationale, exact scope, red-green evidence, full-gate result, and production verification plan.

- [ ] **Step 3: Monitor and address required checks**

Use GitHub CLI with network permission to inspect every required check and failure log. Make only root-cause fixes within the approved scope, rerun local verification, push, and wait for a fresh successful check suite.

- [ ] **Step 4: Merge through the protected branch flow**

Merge only after the PR is reviewable, required checks pass, and branch protection permits integration. Record the exact merged `main` SHA.

- [ ] **Step 5: Verify deployment and scanner intake**

Verify the exact merged SHA's Pages workflow and environment deployment, fetch a fresh deployed V3 target manifest, and confirm every currently eligible preset repository is present. Then inspect the corresponding TavernKeeper reconciliation run/state to prove the new targets were accepted into its normal exact-SHA pipeline; do not claim completed assessments until their reports have actually published and Tavernary has imported them.
