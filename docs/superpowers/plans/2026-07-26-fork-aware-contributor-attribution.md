# Fork-Aware Contributor Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attribute GitHub forks from bounded, resumable merged-pull-request history instead of inherited repository contributors.

**Architecture:** Add the GitHub `isFork` fact to repository observations, then route contributor collection by repository type. Original repositories keep the current contributors endpoint; forks use a two-page-per-refresh merged-PR collector whose accounts and continuation state persist in schema-v2 snapshots. Catalog attribution exposes partial fork scans without changing browser-side data acquisition.

**Tech Stack:** Node.js 24, TypeScript, JavaScript ES modules, GitHub GraphQL and REST APIs, JSON Schema, Vitest, Next.js static catalog generation.

## Global Constraints

- Do not traverse branches or commit ancestry.
- Spend at most two pull-request REST requests per fork per refresh.
- Preserve merged-PR authors historically after first observation.
- Keep original-repository contributor behavior unchanged.
- Keep GitHub access in build and automation code; browser code must not call GitHub.
- Preserve existing contributor facts and mark them stale on project-specific failures.
- Keep `repository.fork` optional in schema version 2 for existing checked-in snapshots.
- Do not modify unrelated untracked files.

---

### Task 1: Observe and persist the repository fork fact

**Files:**
- Modify: `scripts/catalog/github-observer.mjs`
- Modify: `scripts/catalog/github-observer.d.mts`
- Modify: `scripts/catalog/repository-snapshot.mjs`
- Modify: `scripts/catalog/repository-snapshot.d.mts`
- Modify: `data/schemas/repository-snapshot.schema.json`
- Test: `tests/unit/github-observer.test.ts`
- Test: `tests/unit/repository-snapshot.test.ts`
- Test: `tests/unit/validate-catalog.test.ts`

**Interfaces:**
- Produces: `RepositoryObservation.repository.fork: boolean`
- Produces: `RepositorySnapshot.repository.fork?: boolean`
- Consumes: GitHub GraphQL `Repository.isFork`

- [ ] **Step 1: Write failing observer and snapshot tests**

Add `isFork: true` to a repository-node fixture and assert:

```ts
expect(result.observations[0].repository).toMatchObject({
  fork: true,
});
```

Add `fork: true` to the repository observation used by
`repository-snapshot.test.ts` and assert:

```ts
expect(snapshot.repository.fork).toBe(true);
```

Add a validation test proving both a legacy snapshot without `fork` and a new
snapshot with `fork: true` are accepted.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/github-observer.test.ts tests/unit/repository-snapshot.test.ts tests/unit/validate-catalog.test.ts
```

Expected: the fork assertions fail because observations and snapshots do not
yet contain the fact.

- [ ] **Step 3: Implement the minimal fork fact flow**

Add `isFork` to `repositorySelection()`, require a boolean in
`parseObservation()`, and map it to `repository.fork`. Promote it in
`repositoryFacts()`:

```js
fork: observation.fork,
```

Update the declaration files. Add an optional boolean to the schema:

```json
"fork": { "type": "boolean" }
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit the fork metadata slice**

```powershell
git add -- scripts/catalog/github-observer.mjs scripts/catalog/github-observer.d.mts scripts/catalog/repository-snapshot.mjs scripts/catalog/repository-snapshot.d.mts data/schemas/repository-snapshot.schema.json tests/unit/github-observer.test.ts tests/unit/repository-snapshot.test.ts tests/unit/validate-catalog.test.ts
git commit -m "feat(catalog): observe repository forks"
```

---

### Task 2: Add bounded merged-PR contributor collection

**Files:**
- Modify: `scripts/catalog/github-contributors.mjs`
- Modify: `scripts/catalog/github-contributors.d.mts`
- Test: `tests/unit/github-contributors.test.ts`

**Interfaces:**
- Keeps: `fetchRepositoryContributors(repository, options)` for original repositories
- Produces: `fetchForkContributors(repository, options)`
- Produces:

```ts
interface ForkContributorCollection {
  accounts: GitHubContributorAccount[];
  requestCount: number;
  baselineCompletedAt: string | null;
  scan: {
    nextPage: number;
    cutoffAt: string | null;
    targetWatermark: string;
  } | null;
}
```

- Consumes:

```ts
interface ForkContributorState {
  accounts: GitHubContributorAccount[];
  baselineCompletedAt: string | null;
  scan: ForkContributorCollection["scan"];
}
```

- [ ] **Step 1: Read the test-quality reference**

Read `C:\Users\Keptin\.codex\plugins\cache\openai-curated-remote\superpowers\6.2.0\skills\test-driven-development\writing-good-tests.md` completely before editing tests.

- [ ] **Step 2: Write failing tests for fork evidence**

Add tests with real `Response` objects proving:

```ts
const result = await fetchForkContributors(
  { owner: "aikohanasaki", name: "Aikobots" },
  {
    token: "test-token",
    now: "2026-07-27T00:00:00.000Z",
    fetchImpl,
  },
);

expect(result.accounts).toEqual([
  { login: "LeRobber", type: "User" },
  { login: "dependabot[bot]", type: "Bot" },
]);
```

The fixture must include:

- a merged PR by `LeRobber`;
- an unmerged closed PR by an inherited SillyTavern identity;
- a merged owner-authored PR;
- a merged bot-authored PR;
- a duplicate author;
- `updated_at` and `merged_at` timestamps.

Add separate tests proving:

- no more than two linked pages are requested and `nextPage` is persisted;
- a baseline resumes from its stored page;
- an incremental scan stops at `cutoffAt`;
- known accounts are unioned case-insensitively;
- malformed rows and unsafe continuation links fail with counted errors;
- authentication and rate-limit classification match the existing collector.

- [ ] **Step 3: Run the collector tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/github-contributors.test.ts
```

Expected: tests fail because `fetchForkContributors` is not exported.

- [ ] **Step 4: Implement the minimal bounded collector**

Implement a shared authenticated request/error path and a fork collector that:

1. starts at `scan.nextPage` or page 1;
2. requests closed PRs ordered by `updated` descending with 100 per page;
3. consumes at most `maxPages ?? 2`;
4. accepts only rows with `merged_at !== null`;
5. validates `user.login`, `user.type`, and `updated_at`;
6. stops at `updated_at <= cutoffAt` during incremental scans;
7. unions accounts case-insensitively with prior accounts;
8. stores a continuation scan when the request budget ends;
9. records `baselineCompletedAt` only when the first complete history scan ends;
10. rejects continuation URLs outside
    `https://api.github.com/repos/{owner}/{name}/pulls`.

Keep the existing original-repository response shape unchanged.

- [ ] **Step 5: Run collector tests and verify GREEN**

Run the command from Step 3. Expected: all contributor collector tests pass.

- [ ] **Step 6: Commit the collector slice**

```powershell
git add -- scripts/catalog/github-contributors.mjs scripts/catalog/github-contributors.d.mts tests/unit/github-contributors.test.ts
git commit -m "feat(catalog): collect fork PR authors"
```

---

### Task 3: Persist resumable fork contributor state during refresh

**Files:**
- Modify: `scripts/catalog/repository-snapshot.mjs`
- Modify: `scripts/catalog/repository-snapshot.d.mts`
- Modify: `scripts/catalog/refresh-github.mjs`
- Modify: `scripts/catalog/refresh-github.d.mts`
- Modify: `data/schemas/repository-snapshot.schema.json`
- Test: `tests/unit/refresh-github-contributors.test.ts`
- Test: `tests/unit/refresh-failure-recovery.test.ts`
- Test: `tests/unit/validate-catalog.test.ts`

**Interfaces:**
- Produces:

```ts
interface ContributorSnapshot {
  accounts: ContributorAccount[];
  method: "repository-contributors" | "merged-pull-requests";
  baseline_completed_at: string | null;
  scan: {
    next_page: number;
    cutoff_at: string | null;
    target_watermark: string;
  } | null;
  refreshed_at: string;
  stale_since: string | null;
}
```

- Consumes: `RepositoryObservation.repository.fork`
- Consumes: `fetchForkContributors()` from Task 2

- [ ] **Step 1: Write failing refresh persistence tests**

Extend the refresh fixture with `repository.fork`. Add tests proving:

- `fork: false` invokes the original collector with `{ owner, name }`;
- `fork: true` invokes the fork collector with the prior accounts and scan;
- a partial result persists `method`, `baseline_completed_at: null`, and `scan`;
- a completed result clears `scan` and stores `baseline_completed_at`;
- a later result unions historical accounts;
- project-specific failure preserves all prior fork scan state and marks stale;
- REST request totals include fork pages;
- the existing three-repository concurrency ceiling remains unchanged.

- [ ] **Step 2: Run refresh and validation tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/refresh-github-contributors.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/validate-catalog.test.ts
```

Expected: new contributor-state assertions fail because snapshots only store
accounts and timestamps.

- [ ] **Step 3: Implement snapshot state normalization**

Change `contributorSnapshotForSuccess()` to accept a collection result plus
`now`, normalize camelCase collector state to snake_case JSON, and preserve the
existing failure function's whole-object copy behavior.

For legacy contributor snapshots without a method, treat them as
`repository-contributors`. Do not require new contributor fields in schema v2,
but validate them when present.

- [ ] **Step 4: Route collection by fork state**

Build contributor jobs with the full observed repository facts. The default
collector must call:

```js
observation.repository.fork
  ? fetchForkContributors(repository, {
      token,
      now,
      previous: previous?.contributors,
    })
  : fetchRepositoryContributors(repository, { token });
```

Injected `fetchContributors` remains a single seam receiving repository facts,
prior contributor state, and `now`, so unit tests and submission generation can
exercise the same routing contract.

- [ ] **Step 5: Run refresh and validation tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 6: Commit the refresh persistence slice**

```powershell
git add -- scripts/catalog/repository-snapshot.mjs scripts/catalog/repository-snapshot.d.mts scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts data/schemas/repository-snapshot.schema.json tests/unit/refresh-github-contributors.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/validate-catalog.test.ts
git commit -m "feat(catalog): persist fork contributor scans"
```

---

### Task 4: Expose partial attribution through the static catalog

**Files:**
- Modify: `src/lib/github/contributors.ts`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `src/features/catalog/project-attribution.ts`
- Test: `tests/unit/contributors.test.ts`
- Test: `tests/unit/build-catalog.test.ts`
- Test: `tests/unit/project-attribution.test.ts`

**Interfaces:**
- Extends: `CatalogAttribution.status` with `"partial"`
- Produces tooltip/accessibility suffix:
  `Contributor history still scanning`

- [ ] **Step 1: Write failing partial-status tests**

Create a merged-PR contributor snapshot with
`baseline_completed_at: null` and non-null `scan`. Assert:

```ts
expect(catalogAttribution("aikohanasaki", snapshot)).toMatchObject({
  contributors: [{ login: "LeRobber", botOrAi: false }],
  humanContributorCount: 1,
  status: "partial",
});
```

Assert the catalog build never includes inherited fixture identities and the
tooltip/accessibility helpers append:

```text
Contributor history still scanning
```

- [ ] **Step 2: Run attribution tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/contributors.test.ts tests/unit/build-catalog.test.ts tests/unit/project-attribution.test.ts
```

Expected: status remains `current` and partial disclosure text is absent.

- [ ] **Step 3: Implement partial catalog status**

Return `partial` only when:

```ts
contributors.method === "merged-pull-requests" &&
contributors.baseline_completed_at === null &&
contributors.stale_since === null
```

Stale takes precedence over partial. Pending remains reserved for no contributor
snapshot. Update static catalog types and both disclosure helpers.

- [ ] **Step 4: Run attribution tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit the catalog status slice**

```powershell
git add -- src/lib/github/contributors.ts src/features/catalog/catalog-types.ts src/features/catalog/project-attribution.ts tests/unit/contributors.test.ts tests/unit/build-catalog.test.ts tests/unit/project-attribution.test.ts
git commit -m "feat(catalog): disclose partial attribution"
```

---

### Task 5: Apply fork-aware collection to project submissions

**Files:**
- Modify: `scripts/submissions/generate-project-submission.mjs`
- Test: `tests/unit/generate-project-submission-cli.test.ts`
- Test: `tests/unit/draft-project-record.test.ts`

**Interfaces:**
- Consumes: observed `repository.fork`
- Consumes: the same contributor collection routing contract as refresh
- Produces: initial fork snapshots with partial or complete merged-PR evidence

- [ ] **Step 1: Write a failing fork-submission test**

Make the observed repository a fork and assert the injected contributor
collector receives:

```ts
expect.objectContaining({
  owner: "Creator",
  name: "Project",
  fork: true,
})
```

Return a partial merged-PR result and assert the generated snapshot preserves
its method, accounts, baseline state, and continuation.

- [ ] **Step 2: Run submission tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/generate-project-submission-cli.test.ts tests/unit/draft-project-record.test.ts
```

Expected: the collector input omits `fork` and the initial snapshot drops scan
state.

- [ ] **Step 3: Implement shared collection-result persistence**

Pass the complete observed repository facts to contributor collection. Route
forks through the merged-PR collector and pass the returned collection result
to `createInitialRepositorySnapshot()` instead of passing only `accounts`.

- [ ] **Step 4: Run submission tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit the submission slice**

```powershell
git add -- scripts/submissions/generate-project-submission.mjs tests/unit/generate-project-submission-cli.test.ts tests/unit/draft-project-record.test.ts
git commit -m "fix(submissions): respect fork attribution"
```

---

### Task 6: Refresh Aikobots data and verify the complete system

**Files:**
- Modify through normal refresh: `data/snapshots/github/aikohanasaki-aikobots.json`
- Modify through catalog build: `src/generated/catalog.json`
- Modify through normal refresh/build only: affected manifests or reports

**Interfaces:**
- Uses: GitHub CLI authentication required by repository instructions
- Proves: inherited SillyTavern identities are absent and `LeRobber` is retained

- [ ] **Step 1: Verify GitHub CLI authentication**

Run:

```powershell
gh auth status
```

If the token is expired, stop and ask the user to reauthenticate.

- [ ] **Step 2: Run all focused fork-attribution tests**

Run:

```powershell
npm.cmd test -- tests/unit/github-observer.test.ts tests/unit/github-contributors.test.ts tests/unit/repository-snapshot.test.ts tests/unit/refresh-github-contributors.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/contributors.test.ts tests/unit/build-catalog.test.ts tests/unit/project-attribution.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/draft-project-record.test.ts tests/unit/validate-catalog.test.ts
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 3: Run the targeted Aikobots refresh**

Load the GitHub CLI token into the refresh process and select only Aikobots:

```powershell
$env:GITHUB_TOKEN = gh auth token
npm.cmd run catalog:refresh -- --mode incremental --project-id aikohanasaki-aikobots
```

Expected snapshot facts:

```json
{
  "repository": { "fork": true },
  "contributors": {
    "method": "merged-pull-requests",
    "accounts": [{ "login": "LeRobber", "type": "User" }]
  }
}
```

The account array may also contain real merged-PR bot authors. It must not
contain inherited identities such as `Cohee1207`, `Wolfsblvt`, or
`RossAscends` unless live fork-specific PR evidence proves otherwise.

- [ ] **Step 4: Build and inspect generated Aikobots attribution**

Run:

```powershell
npm.cmd run catalog:validate
npm.cmd run catalog:build
```

Inspect `aikohanasaki-aikobots` in `src/generated/catalog.json`. Expected:
owner `aikohanasaki`, genuine merged-PR contributors only, and `partial` until
the bounded baseline finishes.

- [ ] **Step 5: Run the full verification gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
unit tests, production build, and static export verification all exit zero.

- [ ] **Step 6: Review the final diff and commit generated evidence**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Verify unrelated untracked files remain untouched. Stage only fork-attribution
implementation, tests, schema, and normally generated data, then commit:

```powershell
git add -- scripts/catalog/github-observer.mjs scripts/catalog/github-observer.d.mts scripts/catalog/github-contributors.mjs scripts/catalog/github-contributors.d.mts scripts/catalog/repository-snapshot.mjs scripts/catalog/repository-snapshot.d.mts scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts scripts/submissions/generate-project-submission.mjs src/lib/github/contributors.ts src/features/catalog/catalog-types.ts src/features/catalog/project-attribution.ts data/schemas/repository-snapshot.schema.json data/snapshots/github/aikohanasaki-aikobots.json src/generated/catalog.json tests/unit/github-observer.test.ts tests/unit/github-contributors.test.ts tests/unit/repository-snapshot.test.ts tests/unit/refresh-github-contributors.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/contributors.test.ts tests/unit/build-catalog.test.ts tests/unit/project-attribution.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/draft-project-record.test.ts tests/unit/validate-catalog.test.ts
git commit -m "fix(catalog): isolate fork contributors"
```
