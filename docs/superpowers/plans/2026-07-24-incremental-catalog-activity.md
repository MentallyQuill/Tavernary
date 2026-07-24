# Incremental Catalog Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace serial 500-commit repository refreshes with a batched observation, incremental delta, and bounded fallback pipeline while preserving a truthful twelve-week tile graph.

**Architecture:** Store fixed-week source-activity evidence in version 2 snapshots. Observe repository heads and releases in GraphQL batches, inspect only changed deltas through REST, and reserve time-bounded Git clones for baselines and recovery. Derive sorting and twelve binary tile ticks from evidence, publish validated candidates atomically, and drive the baseline queue from snapshot status rather than numeric indexes.

**Tech Stack:** Node.js 24 ESM, TypeScript 6 declaration files, GitHub GraphQL and REST APIs, Git CLI partial clones, JSON Schema/Ajv, Vitest 4, React 19, Next.js 16 static export, GitHub Actions, Playwright.

## Global Constraints

- Keep Tavernary static and GitHub Pages-native; add no runtime backend, database, queue service, webhook service, or GitHub App.
- Weeks begin Monday at `00:00:00 UTC`.
- Retain the current week and previous eleven fixed weeks.
- One source-bearing change activates a week; commit volume never increases rank.
- Keep release evidence separate from source-week activity.
- Version 1 snapshot support ends after the one-time migration.
- Normal unchanged incremental runs perform zero Git clones.
- REST requests remain serial; Git fallback concurrency is at most three.
- Git inspections are bounded to 100 days, five minutes, and bounded output.
- Preserve last-known-good facts on isolated soft failures.
- Abort publication on authentication, rate-budget, malformed-batch, validation, build, or publication failure.
- The tile keeps `N/12` and renders twelve binary weekly ticks, oldest left and current week right.
- Preserve unrelated user changes and stage only files named by each task.

## File Structure

### New focused modules

- `scripts/catalog/activity-evidence.mjs`: fixed-week normalization, evidence reduction, migration summaries, and derived public activity.
- `scripts/catalog/activity-evidence.d.mts`: public types for activity evidence.
- `scripts/catalog/migrate-repository-snapshots.mjs`: one-time version 1 to version 2 snapshot migration CLI.
- `scripts/catalog/migrate-repository-snapshots.d.mts`: migration interfaces.
- `scripts/catalog/github-observer.mjs`: serial GraphQL batching and repository observation parsing.
- `scripts/catalog/github-observer.d.mts`: observer input, result, usage, and error types.
- `scripts/catalog/github-inspector.mjs`: REST delta acceptance/classification and bounded Git baseline/fallback inspection.
- `scripts/catalog/github-inspector.d.mts`: delta and Git inspection contracts.
- `scripts/catalog/github-refresh-manifest.mjs`: sanitized run accounting and manifest formatting.
- `scripts/catalog/github-refresh-manifest.d.mts`: manifest contracts.
- `data/schemas/github-refresh.schema.json`: committed global refresh-manifest schema.
- `tests/unit/activity-evidence.test.ts`: fixed-week and reducer tests.
- `tests/unit/migrate-repository-snapshots.test.ts`: migration tests.
- `tests/unit/github-observer.test.ts`: GraphQL batching tests.
- `tests/unit/github-inspector.test.ts`: compare and fallback tests.
- `tests/unit/github-refresh-manifest.test.ts`: run accounting and sanitization tests.
- `tests/unit/incremental-refresh.test.ts`: orchestrator integration tests with injected upstream operations.

### Existing files with changed responsibilities

- `data/schemas/repository-snapshot.schema.json`: becomes version 2 only.
- `scripts/catalog/refresh-github.mjs`: becomes orchestration, selection, staging, validation, and publication rather than containing every GitHub operation.
- `scripts/catalog/refresh-github.d.mts`: exports orchestration and selection interfaces.
- `scripts/catalog/build.mjs`: derives browser activity from version 2 evidence and uses the global refresh manifest.
- `scripts/catalog/build.d.mts`: accepts an optional refresh manifest in tests.
- `scripts/catalog/validate.mjs`: validates both project snapshots and the global manifest.
- `src/lib/github/activity.ts`: retains source-path classification and drops weighted commit scoring.
- `src/features/catalog/catalog-types.ts`: exposes source activity, twelve booleans, and evidence status.
- `src/features/catalog/catalog-selectors.ts`: implements recent and sustained activity ordering.
- `src/features/catalog/catalog-query.ts`: renames the `strength` sort to `sustained`.
- `src/features/catalog/components/activity-sparkline.tsx`: becomes a twelve-tick binary strip while retaining the file path to avoid an unnecessary import rename.
- `src/features/catalog/components/project-card.tsx`: renders source-activity wording and evidence-state tooltips.
- `src/styles/catalog.css`: styles twelve equal ticks and provisional/degraded states.
- `.github/workflows/refresh-catalog.yml`: exposes incremental, baseline, project, and forensic modes and dynamic continuation.
- `README.md` and `docs/architecture/github-refresh-methodology.md`: document operator behavior and metric semantics.

---

### Task 1: Add the Fixed-Week Evidence Reducer

**Files:**
- Create: `scripts/catalog/activity-evidence.mjs`
- Create: `scripts/catalog/activity-evidence.d.mts`
- Create: `tests/unit/activity-evidence.test.ts`

**Interfaces:**
- Produces: `weekStartUtc(timestamp): string`
- Produces: `weekWindow(now): string[]`, ordered oldest to newest with exactly twelve Monday dates.
- Produces: `normalizeSourceWeeks(weeks, now): SourceWeek[]`, ordered newest to oldest.
- Produces: `recordIntervalActivity(activity, input): ActivityEvidence`
- Produces: `completeBaseline(activity, input): ActivityEvidence`
- Produces: `derivePublicActivity(activity, now): { activeWeeks12; weeklyActivity; dormant }`
- `weeklyActivity` is a twelve-boolean tuple ordered oldest to newest.

- [ ] **Step 1: Write failing fixed-week and reducer tests**

```ts
import { expect, test } from "vitest";
import {
  completeBaseline,
  derivePublicActivity,
  recordIntervalActivity,
  weekStartUtc,
  weekWindow,
} from "../../scripts/catalog/activity-evidence.mjs";

test("normalizes Monday UTC across a Sunday boundary", () => {
  expect(weekStartUtc("2026-07-19T23:59:59.000Z")).toBe("2026-07-13");
  expect(weekStartUtc("2026-07-20T00:00:00.000Z")).toBe("2026-07-20");
});

test("one interval activates a week without commit-volume weighting", () => {
  const first = recordIntervalActivity(provisionalActivity(), {
    activityAt: "2026-07-22T18:31:00.000Z",
    observedAt: "2026-07-23T07:17:00.000Z",
  });
  const second = recordIntervalActivity(first, {
    activityAt: "2026-07-24T18:31:00.000Z",
    observedAt: "2026-07-25T07:17:00.000Z",
  });

  expect(second.source_weeks).toHaveLength(1);
  expect(second.source_weeks[0]).toMatchObject({
    week_start: "2026-07-20",
    latest_at: "2026-07-24T18:31:00.000Z",
    precision: "interval",
  });
});

test("derives twelve binary ticks and active weeks", () => {
  const activity = completeBaseline(provisionalActivity(), {
    now: "2026-07-24T00:00:00.000Z",
    completedAt: "2026-07-24T00:00:00.000Z",
    sourceCommits: [
      "2026-07-22T00:00:00.000Z",
      "2026-07-08T00:00:00.000Z",
      "2026-06-01T00:00:00.000Z",
    ],
  });

  expect(derivePublicActivity(activity, "2026-07-24T00:00:00.000Z")).toEqual({
    activeWeeks12: 3,
    weeklyActivity: [
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      true,
      false,
      true,
    ],
    dormant: false,
  });
});
```

Include fixtures for provisional evidence and tests covering duplicate weeks,
twelve-week pruning, timestamps outside the window, `latest_source_activity_at`
surviving pruning, `precision: "exact"` winning over `interval`, null activity,
and a complete no-source baseline.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/activity-evidence.test.ts
```

Expected: FAIL because `scripts/catalog/activity-evidence.mjs` does not exist.

- [ ] **Step 3: Implement the evidence types and reducer**

Use this public shape:

```js
export function weekStartUtc(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid activity timestamp: ${timestamp}`);
  }
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function derivePublicActivity(activity, now) {
  const starts = weekWindow(now);
  const active = new Set(
    normalizeSourceWeeks(activity.source_weeks, now).map(
      ({ week_start }) => week_start,
    ),
  );
  const weeklyActivity = starts.map((start) => active.has(start));
  const activeWeeks12 = weeklyActivity.filter(Boolean).length;
  const latest = activity.latest_source_activity_at;
  const dormant =
    activity.evidence_status === "complete" &&
    (latest === null ||
      new Date(now).getTime() - new Date(latest).getTime() >
        12 * 7 * 24 * 60 * 60 * 1000);
  return { activeWeeks12, weeklyActivity, dormant };
}
```

`completeBaseline` must replace provisional evidence, group source commit
timestamps by Monday, keep the latest timestamp per week, set every precision
to `exact`, set `evidence_status: "complete"`, set
`baseline_completed_at`, and retain at most twelve weeks.

- [ ] **Step 4: Run reducer tests and formatting**

Run:

```powershell
npm.cmd test -- --run tests/unit/activity-evidence.test.ts
npm.cmd exec -- prettier --check scripts/catalog/activity-evidence.mjs scripts/catalog/activity-evidence.d.mts tests/unit/activity-evidence.test.ts
```

Expected: all tests pass and Prettier reports all files matched.

- [ ] **Step 5: Commit the reducer**

```powershell
git add scripts/catalog/activity-evidence.mjs scripts/catalog/activity-evidence.d.mts tests/unit/activity-evidence.test.ts
git commit -m "feat(catalog): add activity evidence reducer"
```

---

### Task 2: Migrate Snapshots to Version 2

**Files:**
- Modify: `data/schemas/repository-snapshot.schema.json`
- Create: `scripts/catalog/migrate-repository-snapshots.mjs`
- Create: `scripts/catalog/migrate-repository-snapshots.d.mts`
- Create: `tests/unit/migrate-repository-snapshots.test.ts`
- Modify: `tests/unit/validate-catalog.test.ts`
- Modify: `scripts/catalog/build.mjs`
- Modify: `scripts/catalog/build.d.mts`
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `package.json`
- Modify generated data: `data/snapshots/github/*.json`
- Modify generated data: `src/generated/catalog.json`

**Interfaces:**
- Consumes: Task 1 `derivePublicActivity`.
- Produces: `migrateSnapshotV1(snapshot, now): RepositorySnapshotV2`
- Produces CLI: `npm run catalog:migrate-snapshots -- --write`
- Temporarily keeps the existing browser activity property names derived from
  version 2 evidence so the current UI remains functional until Task 3.

- [ ] **Step 1: Write failing schema and migration tests**

```ts
test("migrates v1 counts into provisional booleans without inventing fixed weeks", () => {
  const migrated = migrateSnapshotV1(v1Snapshot({
    weekly_meaningful_commits: [3, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 1],
  }), "2026-07-24T00:00:00.000Z");

  expect(migrated.schema_version).toBe(2);
  expect(migrated.activity).toMatchObject({
    latest_source_activity_at: "2026-07-20T00:00:00.000Z",
    source_weeks: [],
    provisional_weeks: [
      true, false, true, false, false, true,
      false, false, false, false, false, true,
    ],
    evidence_status: "provisional",
    baseline_completed_at: null,
    baseline_attempts: 0,
  });
  expect(migrated.activity).not.toHaveProperty("strength");
});

test("v2 schema rejects v1 snapshots", async () => {
  const result = await validateCatalog({
    records: [record],
    snapshots: [v1Snapshot()],
  });
  expect(result.errors.join("\n")).toContain("schema /schema_version");
});
```

Add validation cases for complete, provisional, and degraded states; unique
Monday week starts; at most twelve entries; `provisional_weeks` legality; and
the required nullable `head_committed_at`. Only provisional evidence may retain
a null head timestamp.

- [ ] **Step 2: Run migration tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/migrate-repository-snapshots.test.ts tests/unit/validate-catalog.test.ts
```

Expected: FAIL because the migration module and version 2 schema do not exist.

- [ ] **Step 3: Implement the version 2 schema and migration CLI**

The migration must:

```js
export function migrateSnapshotV1(snapshot, now) {
  if (snapshot.schema_version !== 1) {
    throw new Error(`${snapshot.project_id}: expected snapshot schema 1`);
  }
  return {
    ...snapshot,
    schema_version: 2,
    repository: {
      ...snapshot.repository,
      head_committed_at: null,
    },
    activity: {
      latest_source_activity_at:
        snapshot.activity.latest_meaningful_commit_at,
      source_weeks: [],
      provisional_weeks: snapshot.activity.weekly_meaningful_commits
        .map((count) => count > 0)
        .reverse(),
      latest_release_at: snapshot.activity.latest_release_at,
      evidence_status: "provisional",
      baseline_completed_at: null,
      baseline_attempts: 0,
    },
  };
}
```

Use atomic `.tmp` plus `rename` writes. Without `--write`, print counts without
modifying files. Reject mixed invalid versions rather than partially writing.

- [ ] **Step 4: Update the catalog builder for v2 evidence**

Use `derivePublicActivity(snapshot.activity, now)` and, while evidence is
provisional, derive the temporary old browser fields from
`provisional_weeks`. Do not read any version 1 snapshot property.

```js
const derived = derivePublicActivity(snapshot.activity, now);
const provisional =
  snapshot.activity.provisional_weeks ??
  Array.from({ length: 12 }, () => false);
const weekly = snapshot.activity.evidence_status === "complete"
  ? derived.weeklyActivity
  : provisional;

activity: {
  latestMeaningfulCommitAt: snapshot.activity.latest_source_activity_at,
  activeWeeks12: weekly.filter(Boolean).length,
  twoWeekBars: pairBooleanWeeks(weekly),
  strength: weekly.filter(Boolean).length,
  dormant: derived.dormant,
}
```

This bridge exists only so Task 2 can pass the full project checks. Task 3
removes it and emits the final public contract.

- [ ] **Step 5: Run focused tests before rewriting data**

Run:

```powershell
npm.cmd test -- --run tests/unit/activity-evidence.test.ts tests/unit/migrate-repository-snapshots.test.ts tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 6: Migrate committed snapshots and rebuild generated catalog**

Run:

```powershell
npm.cmd run catalog:migrate-snapshots -- --write
npm.cmd run catalog:validate
npm.cmd run catalog:build
```

Expected: every file under `data/snapshots/github/` has
`"schema_version": 2`; validation succeeds; generated catalog rebuilds.

- [ ] **Step 7: Verify no version 1 snapshot remains**

Run:

```powershell
rg -n '"schema_version": 1|weekly_meaningful_commits|latest_meaningful_commit_at|"strength"' data/snapshots/github
```

Expected: no matches.

- [ ] **Step 8: Run the full local gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette, catalog validation/build, types, tests,
static build, and export verification all pass.

- [ ] **Step 9: Commit the schema and data migration**

```powershell
git add package.json data/schemas/repository-snapshot.schema.json scripts/catalog/activity-evidence.mjs scripts/catalog/migrate-repository-snapshots.mjs scripts/catalog/migrate-repository-snapshots.d.mts scripts/catalog/build.mjs scripts/catalog/build.d.mts tests/unit/migrate-repository-snapshots.test.ts tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts data/snapshots/github src/generated/catalog.json
git commit -m "feat(catalog): migrate activity snapshots"
```

---

### Task 3: Render Twelve Source-Activity Ticks

**Files:**
- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `src/features/catalog/catalog-query.ts`
- Modify: `src/features/catalog/catalog-selectors.ts`
- Modify: `src/features/catalog/components/activity-sparkline.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/features/catalog/components/catalog-toolbar.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `tests/unit/catalog-selectors.test.ts`
- Modify: `tests/unit/catalog-license-filter-contract.test.tsx`
- Modify: `tests/unit/project-card.test.tsx`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify generated data: `src/generated/catalog.json`

**Interfaces:**
- Consumes: Task 1 `derivePublicActivity`.
- Produces browser activity:

```ts
activity: {
  latestSourceActivityAt: string | null;
  activeWeeks12: number | null;
  weeklyActivity: [
    boolean, boolean, boolean, boolean, boolean, boolean,
    boolean, boolean, boolean, boolean, boolean, boolean,
  ] | null;
  evidenceStatus: "provisional" | "complete" | "degraded" | null;
  dormant: boolean;
}
```

- Produces sort values: `recent`, `sustained`, `popularity`, `alphabetical`.

- [ ] **Step 1: Write failing build, selector, and component tests**

```tsx
test("renders twelve ticks matching the active-week total", () => {
  render(
    <ProjectCard
      project={project("activity-card", {
        activity: {
          latestSourceActivityAt: "2026-07-20T00:00:00Z",
          activeWeeks12: 5,
          weeklyActivity: [
            true, false, true, false, false, true,
            false, false, true, false, false, true,
          ],
          evidenceStatus: "complete",
          dormant: false,
        },
      })}
      now="2026-07-24T00:00:00Z"
    />,
  );

  expect(screen.getByText("5/12")).toBeInTheDocument();
  expect(
    screen.getByLabelText("Source activity in 5 of the last 12 weeks"),
  ).toBeInTheDocument();
  expect(document.querySelectorAll(".activity-weeks i")).toHaveLength(12);
  expect(document.querySelectorAll(".activity-weeks i.active")).toHaveLength(5);
});

test("recent activity uses the newer source or release timestamp", () => {
  const selected = selectProjects(
    [
      project("released", {
        activity: sourceActivity("2026-06-01T00:00:00Z", 2),
        latestReleaseAt: "2026-07-23T00:00:00Z",
      }),
      project("source", {
        activity: sourceActivity("2026-07-20T00:00:00Z", 8),
      }),
    ],
    { ...DEFAULT_QUERY, sort: "recent" },
    { now: "2026-07-24T00:00:00Z" },
  );
  expect(selected.map(({ id }) => id)).toEqual(["released", "source"]);
});
```

Add provisional `~5/12`, degraded tooltip, no-source complete state, sustained
sort, query parse/serialize, and hidden card-description cases.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/build-catalog.test.ts tests/unit/catalog-selectors.test.ts tests/unit/project-card.test.tsx
```

Expected: FAIL because the public catalog still exposes the old activity names
and six bars.

- [ ] **Step 3: Emit the final browser activity contract**

Remove the temporary Task 2 bridge. Increment `Catalog.schemaVersion` to `2`.
The builder must emit twelve booleans oldest to newest and expose the global
evidence status.

```js
const publicActivity = derivePublicActivity(snapshot.activity, now);
const weeklyActivity =
  snapshot.activity.evidence_status === "complete"
    ? publicActivity.weeklyActivity
    : snapshot.activity.provisional_weeks;

activity: {
  latestSourceActivityAt: snapshot.activity.latest_source_activity_at,
  activeWeeks12: weeklyActivity?.filter(Boolean).length ?? null,
  weeklyActivity,
  evidenceStatus: snapshot.activity.evidence_status,
  dormant: publicActivity.dormant,
}
```

- [ ] **Step 4: Replace strength sorting with sustained activity**

Update query parsing and toolbar copy:

```tsx
<option value="sustained">Sustained Activity</option>
```

For `recent`, compare:

```ts
function activityRecency(project: CatalogProject) {
  return Math.max(
    project.activity.latestSourceActivityAt
      ? new Date(project.activity.latestSourceActivityAt).getTime()
      : Number.NEGATIVE_INFINITY,
    releaseTimestamp(project)
      ? new Date(releaseTimestamp(project)!).getTime()
      : Number.NEGATIVE_INFINITY,
  );
}
```

For `sustained`, sort by `activeWeeks12`, then `activityRecency`, then name and
ID. Replace URL value `strength` with `sustained`; no compatibility alias is
required in pre-alpha.

- [ ] **Step 5: Render the twelve-tick strip**

Keep the component file path but change its API:

```tsx
export function ActivitySparkline({
  weeks,
}: {
  weeks: readonly boolean[];
}) {
  return (
    <span className="activity-weeks" aria-hidden="true">
      {weeks.map((active, index) => (
        <i key={index} className={active ? "active" : undefined} />
      ))}
    </span>
  );
}
```

Use equal-height ticks. The oldest tick is the first DOM element and the current
week is the last. The graph is decorative; the tooltip trigger carries the
meaningful accessible label.

For provisional evidence render `~N/12`. For degraded evidence retain valid
ticks and append the incomplete-evidence sentence to tooltip and hidden card
description. Rename all visible and accessible `Last commit` copy to
`Last source activity`.

- [ ] **Step 6: Run focused tests and rebuild generated data**

Run:

```powershell
npm.cmd run catalog:build
npm.cmd test -- --run tests/unit/build-catalog.test.ts tests/unit/catalog-selectors.test.ts tests/unit/catalog-license-filter-contract.test.tsx tests/unit/project-card.test.tsx
npm.cmd typecheck
```

Expected: all focused tests and typecheck pass.

- [ ] **Step 7: Run catalog end-to-end tests**

Run:

```powershell
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts
```

Expected: query persistence accepts `sort=sustained`; cards expose the new
source-activity labels; all catalog scenarios pass.

- [ ] **Step 8: Commit the public activity UI**

```powershell
git add scripts/catalog/build.mjs src/generated/catalog.json src/features/catalog/catalog-types.ts src/features/catalog/catalog-query.ts src/features/catalog/catalog-selectors.ts src/features/catalog/components/activity-sparkline.tsx src/features/catalog/components/project-card.tsx src/features/catalog/components/catalog-toolbar.tsx src/features/catalog/components/catalog-page.tsx src/styles/catalog.css tests/unit/build-catalog.test.ts tests/unit/catalog-selectors.test.ts tests/unit/catalog-license-filter-contract.test.tsx tests/unit/project-card.test.tsx tests/e2e/catalog.spec.ts
git commit -m "feat(catalog): render weekly activity ticks"
```

---

### Task 4: Batch GitHub Repository Observations

**Files:**
- Create: `scripts/catalog/github-observer.mjs`
- Create: `scripts/catalog/github-observer.d.mts`
- Create: `tests/unit/github-observer.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RepositoryObservation {
  projectId: string;
  repository: {
    id: number;
    owner: string;
    name: string;
    url: string;
    defaultBranch: string;
    headSha: string;
    headCommittedAt: string;
    archived: boolean;
    createdAt: string;
    sizeKb: number;
  };
  community: {
    stargazersCount: number;
    forksCount: number;
    subscribersCount: number;
  };
  latestReleaseAt: string | null;
  coarseLicenseSpdxId: string | null;
}
```

- Produces: `observeRepositories(records, options): Promise<ObservationRun>`
- `options` includes `token`, `fetchImpl`, `batchSize`, `logger`, and
  `maxRetries`.
- `ObservationRun` contains ordered per-project successes/failures and
  `{ requestCount, pointCost, remainingPoints }`.

- [ ] **Step 1: Write failing GraphQL batching tests**

```ts
test("observes 53 repositories in three serial batches", async () => {
  const calls: Array<{ active: number; query: string }> = [];
  let active = 0;
  let maximumActive = 0;
  const result = await observeRepositories(records(53), {
    token: "test-token",
    batchSize: 25,
    fetchImpl: async (_url, init) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      calls.push({ active, query: JSON.parse(String(init?.body)).query });
      const response = graphqlResponseFor(calls.length);
      active -= 1;
      return response;
    },
  });

  expect(calls).toHaveLength(3);
  expect(maximumActive).toBe(1);
  expect(result.observations).toHaveLength(53);
  expect(result.usage.requestCount).toBe(3);
});
```

Add tests for `watchers.totalCount -> subscribersCount`, latest release null,
missing default branch, per-alias GraphQL error, immutable ID mismatch input,
authentication failure, malformed rate data, exhausted budget, bounded retry,
and token redaction.

- [ ] **Step 2: Run observer tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/github-observer.test.ts
```

Expected: FAIL because the observer module does not exist.

- [ ] **Step 3: Implement serial GraphQL batches**

Generate aliased query fields and variables rather than interpolating repository
names into GraphQL source:

```js
function repositorySelection(index) {
  return `
    r${index}: repository(owner: $owner${index}, name: $name${index}) {
      databaseId
      name
      nameWithOwner
      url
      createdAt
      diskUsage
      isArchived
      forkCount
      stargazerCount
      watchers { totalCount }
      licenseInfo { spdxId }
      latestRelease { publishedAt }
      defaultBranchRef {
        name
        target {
          ... on Commit { oid committedDate }
        }
      }
    }`;
}
```

Include `rateLimit { cost remaining resetAt }`. POST batches sequentially.
Retry only retryable transport/`5xx` responses and honor `retry-after`.
Represent alias-specific missing/private repositories as per-project failures;
throw a systemic error for authentication, malformed root data, or exhausted
points.

- [ ] **Step 4: Run observer tests, lint, and formatting**

Run:

```powershell
npm.cmd test -- --run tests/unit/github-observer.test.ts
npm.cmd exec -- prettier --check scripts/catalog/github-observer.mjs scripts/catalog/github-observer.d.mts tests/unit/github-observer.test.ts
npm.cmd lint
```

Expected: all tests and checks pass.

- [ ] **Step 5: Commit the observer**

```powershell
git add scripts/catalog/github-observer.mjs scripts/catalog/github-observer.d.mts tests/unit/github-observer.test.ts
git commit -m "feat(catalog): batch GitHub observations"
```

---

### Task 5: Add Delta and Bounded Git Inspection

**Files:**
- Create: `scripts/catalog/github-inspector.mjs`
- Create: `scripts/catalog/github-inspector.d.mts`
- Create: `tests/unit/github-inspector.test.ts`
- Modify: `src/lib/github/activity.ts`
- Modify: `tests/unit/activity.test.ts`
- Modify: `tests/unit/refresh-failure-recovery.test.ts`

**Interfaces:**
- Consumes: Task 1 `recordIntervalActivity` and `completeBaseline`.
- Consumes: existing `classifyCommit(files, options)`.
- Produces: `inspectDelta(input, options): Promise<DeltaInspection>`
- Produces: `inspectGitBaseline(input, options): Promise<GitInspection>`
- Produces: `mapConcurrent(items, limit, worker): Promise<SettledResult[]>`
- A delta result is `accepted-source`, `accepted-excluded`, or `fallback` with
  an exact reason enum.

- [ ] **Step 1: Write failing delta acceptance tests**

```ts
test("accepts a fresh bounded source delta", async () => {
  const result = await inspectDelta(deltaInput(), {
    fetchCompare: async () => ({
      status: "ahead",
      total_commits: 2,
      commits: [
        commit("2026-07-23T02:00:00.000Z"),
        commit("2026-07-23T04:00:00.000Z"),
      ],
      files: [{ filename: "src/index.ts" }],
    }),
  });

  expect(result).toEqual({
    kind: "accepted-source",
    activityAt: "2026-07-23T04:00:00.000Z",
    licenseChanged: false,
  });
});

test.each([
  ["diverged", compare({ status: "diverged" })],
  ["commit-limit", compare({ total_commits: 251 })],
  ["file-limit", compare({ files: files(300) })],
  ["stale-observation", compare(), { previousCheckedHoursAgo: 49 }],
  ["multiweek", compare(), { crossesAmbiguousWeeks: true }],
])("falls back for %s", async (reason, response, input = {}) => {
  await expectInspectionFallback(reason, response, input);
});
```

Add excluded-only path, root license path, compare `404`, malformed dates,
serial REST retry, clone timeout, 100-day argument, exact weekly baseline,
root-license classification, cleanup, and concurrency maximum-three tests.

- [ ] **Step 2: Run inspector tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/github-inspector.test.ts
```

Expected: FAIL because the inspector module does not exist.

- [ ] **Step 3: Implement compare classification**

Accept a comparison only when:

```js
function fallbackReason(input, compare) {
  if (compare.status !== "ahead") return "history-not-ahead";
  if (compare.total_commits > compare.commits.length) return "commit-limit";
  if (compare.files.length >= 300) return "file-limit";
  if (input.hoursSinceLastSuccess > 48) return "stale-observation";
  if (input.crossesAmbiguousWeeks) return "multiweek";
  return null;
}
```

Classify aggregate filenames with the same excluded-path policy used for
commits. Treat root `LICENSE`, `LICENCE`, and `COPYING` variants as a separate
`licenseChanged` signal.

- [ ] **Step 4: Implement the bounded Git inspector**

Use injected `runGit` in tests and `execFile` in production. Every call receives
`timeout: 300_000`, `maxBuffer: 64 * 1024 * 1024`, and `windowsHide: true`.

The fetch/clone path must contain a timestamp boundary:

```js
await runGit(temporaryRoot, [
  "clone",
  "--quiet",
  "--filter=blob:none",
  "--no-checkout",
  `--shallow-since=${cutoffIso}`,
  "--single-branch",
  "--branch",
  defaultBranch,
  `https://github.com/${repository}.git`,
  cloneDirectory,
]);
```

Collect commit SHA, committed date, parents, and names with `git log -w
--since=<cutoff> --name-only`. Use `classifyCommit` to return exact source
timestamps. Always clean the verified temporary root in `finally`.

- [ ] **Step 5: Remove weighted scoring from the old activity module**

Retain `classifyCommit` and source-path exclusions. Remove
`calculateActivity`, `weeklyMeaningfulCommits`, and weighted `strength` tests.
Move all fixed-week behavior to Task 1's reducer.

- [ ] **Step 6: Run inspector and source-classification tests**

Run:

```powershell
npm.cmd test -- --run tests/unit/github-inspector.test.ts tests/unit/activity.test.ts tests/unit/activity-evidence.test.ts tests/unit/license.test.ts tests/unit/refresh-failure-recovery.test.ts
npm.cmd typecheck
```

Expected: all tests and typecheck pass.

- [ ] **Step 7: Commit the inspectors**

```powershell
git add scripts/catalog/github-inspector.mjs scripts/catalog/github-inspector.d.mts src/lib/github/activity.ts tests/unit/github-inspector.test.ts tests/unit/activity.test.ts tests/unit/refresh-failure-recovery.test.ts
git commit -m "feat(catalog): inspect incremental deltas"
```

---

### Task 6: Replace the Refresh Orchestrator and Publish a Manifest

**Files:**
- Create: `scripts/catalog/github-refresh-manifest.mjs`
- Create: `scripts/catalog/github-refresh-manifest.d.mts`
- Create: `data/schemas/github-refresh.schema.json`
- Create: `tests/unit/github-refresh-manifest.test.ts`
- Create: `tests/unit/incremental-refresh.test.ts`
- Modify: `scripts/catalog/refresh-github.mjs`
- Modify: `scripts/catalog/refresh-github.d.mts`
- Modify: `scripts/catalog/validate.mjs`
- Modify: `scripts/catalog/build.mjs`
- Modify: `scripts/catalog/build.d.mts`
- Modify: `tests/unit/refresh-failure-recovery.test.ts`
- Modify: `tests/unit/refresh-snapshot-format.test.ts`
- Modify: `tests/unit/build-catalog.test.ts`
- Create generated data: `data/snapshots/github-refresh.json`
- Modify generated data: `src/generated/catalog.json`

**Interfaces:**
- Consumes: Tasks 1, 4, and 5 modules.
- Produces: `selectRefreshRecords(records, snapshots, options)`
- Produces: `runRefresh(options): Promise<RefreshRunResult>`
- Produces: `buildRefreshManifest(run): GitHubRefreshManifest`
- Produces modes: `incremental`, `baseline`, `project`, `forensic`.
- `BuildCatalogOptions` gains `refreshManifest?: unknown`.

- [ ] **Step 1: Write failing manifest tests**

```ts
test("summarizes outcomes without leaking secrets or clone paths", () => {
  const manifest = buildRefreshManifest({
    mode: "incremental",
    startedAt: "2026-07-24T07:17:00.000Z",
    completedAt: "2026-07-24T07:19:00.000Z",
    outcomes: [
      outcome("unchanged", 120),
      outcome("compare-source", 430),
      outcome("fallback", 1_200, {
        diagnostic: "token ghp_secret at C:\\tmp\\clone",
      }),
    ],
    usage: { graphqlRequests: 1, graphqlPoints: 25, restRequests: 2 },
  });

  expect(manifest.counts).toMatchObject({
    total: 3,
    unchanged: 1,
    changed: 2,
    fallback: 1,
  });
  expect(JSON.stringify(manifest)).not.toContain("ghp_secret");
  expect(JSON.stringify(manifest)).not.toContain("C:\\tmp\\clone");
});
```

Add schema validation, bounded timing list, deployment flag, and no-op run tests.

- [ ] **Step 2: Write failing orchestrator integration tests**

Use injected `observe`, `inspectDelta`, `inspectGit`, `validateCandidates`,
`buildCandidates`, and filesystem functions:

```ts
test("204 unchanged projects require zero clones", async () => {
  const inspectGit = vi.fn();
  const result = await runRefresh({
    mode: "incremental",
    records: records(204),
    snapshots: matchingSnapshots(204),
    observe: fakeMatchingObserver,
    inspectDelta: vi.fn(),
    inspectGit,
    write: false,
  });

  expect(inspectGit).not.toHaveBeenCalled();
  expect(result.manifest.counts).toMatchObject({
    total: 204,
    unchanged: 204,
  });
});

test("selects baseline records from status rather than index", () => {
  expect(
    selectRefreshRecords(records(213), snapshotsWithProvisional([2, 200, 212]), {
      mode: "baseline",
      batchSize: 2,
    }).map(({ id }) => id),
  ).toEqual([recordId(2), recordId(200)]);
});
```

Add changed-source, excluded-only, fallback maximum-three, project/forensic
selection, soft failure, systemic failure, candidate validation failure,
atomic replacement, no-force-push boundary, and manifest write tests.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/github-refresh-manifest.test.ts tests/unit/incremental-refresh.test.ts
```

Expected: FAIL because the manifest and new orchestrator do not exist.

- [ ] **Step 4: Implement sanitized manifest accounting**

Write `data/snapshots/github-refresh.json` with:

```js
{
  schema_version: 1,
  mode,
  started_at,
  completed_at,
  counts: {
    total, checked, changed, unchanged, provisional,
    degraded, unavailable, failed, compared, baseline, fallback
  },
  api: {
    graphql_requests, graphql_points, graphql_remaining, rest_requests
  },
  duration_ms,
  project_timings: boundedTimings.slice(0, 250),
  snapshot_changes,
  deployment_requested
}
```

Timing diagnostics may contain project ID, outcome enum, duration, and sanitized
error code only. Do not persist messages, URLs with credentials, response
bodies, tokens, or temporary paths.

- [ ] **Step 5: Implement mode selection**

```js
export function selectRefreshRecords(records, snapshots, options) {
  const automatic = records
    .filter((record) =>
      record.source.type === "github" &&
      record.refresh_policy === "automatic"
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  if (options.mode === "incremental") return automatic;
  if (options.mode === "baseline") {
    return automatic
      .filter((record) =>
        snapshotStatus(snapshots, record.id) === "provisional"
      )
      .slice(0, options.batchSize);
  }
  if (options.mode === "project" || options.mode === "forensic") {
    const selected = automatic.filter(({ id }) => id === options.projectId);
    if (selected.length !== 1) {
      throw new Error(`Unknown refreshable project: ${options.projectId}`);
    }
    return selected;
  }
  throw new Error(`Unknown refresh mode: ${options.mode}`);
}
```

Require `project_id` for project and forensic modes. Bound baseline batch size
to `1..24`.

- [ ] **Step 6: Implement observation, compare, and fallback orchestration**

Flow per record:

1. Quarantine immutable ID mismatches.
2. If head unchanged, merge metadata/release/community only.
3. If forensic, bypass compare and inspect Git.
4. If provisional in baseline/project mode, inspect Git.
5. Otherwise inspect delta.
6. If delta requests fallback, enqueue Git inspection through
   `mapConcurrent(..., 3, ...)`.
7. Merge source and license evidence through the reducer.
8. On soft failure with a prior snapshot, preserve facts and set
   `stale_since`.
9. After three failed baseline attempts, set `evidence_status: "degraded"`.

Log mode/count at start, batch summaries, every compare result, every Git
inspection start/end with elapsed time, periodic totals, and a final table.

- [ ] **Step 7: Implement staged candidate publication**

Write candidate project snapshots and the manifest under one temporary staging
root. Validate candidate records/snapshots/manifest and call `buildCatalog` with
candidate data before replacing committed files.

Only after every systemic gate succeeds:

```js
for (const candidate of changedCandidates) {
  await rename(candidate.temporaryPath, candidate.destinationPath);
}
await rename(manifestTemporaryPath, manifestPath);
```

If an isolated project failed softly, its preserved stale snapshot is still a
valid candidate. If authentication, rate budget, malformed batch, validation,
build, or filesystem publication fails, replace nothing.

- [ ] **Step 8: Make the build use the global refresh timestamp**

Load `data/snapshots/github-refresh.json`. `Catalog.generatedAt` uses
`options.now` in tests, otherwise the manifest's `completed_at`. Remove the
client-side scan for the maximum project `refreshedAt`; the toolbar receives
the manifest-derived catalog timestamp.

- [ ] **Step 9: Run orchestrator, schema, build, and recovery tests**

Run:

```powershell
npm.cmd test -- --run tests/unit/github-refresh-manifest.test.ts tests/unit/incremental-refresh.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/refresh-snapshot-format.test.ts tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts
npm.cmd run catalog:validate
npm.cmd run catalog:build
npm.cmd typecheck
```

Expected: all focused tests, validation, build, and typecheck pass.

- [ ] **Step 10: Commit the incremental orchestrator**

```powershell
git add scripts/catalog/github-refresh-manifest.mjs scripts/catalog/github-refresh-manifest.d.mts scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts data/schemas/github-refresh.schema.json data/snapshots/github-refresh.json scripts/catalog/validate.mjs scripts/catalog/build.mjs scripts/catalog/build.d.mts src/generated/catalog.json tests/unit/github-refresh-manifest.test.ts tests/unit/incremental-refresh.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/refresh-snapshot-format.test.ts tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts
git commit -m "perf(catalog): make refresh incremental"
```

---

### Task 7: Replace Indexed Backfill with Dynamic Workflow Modes

**Files:**
- Modify: `.github/workflows/refresh-catalog.yml`
- Modify: `tests/unit/workflows.test.ts`
- Create: `tests/unit/refresh-github-workflow-safety.test.ts`

**Interfaces:**
- Consumes Task 6 CLI modes.
- Workflow inputs:
  - `mode`: `incremental`, `baseline`, `project`, or `forensic`
  - `batch_size`: number, default `12`
  - `project_id`: optional string, required by script for project/forensic
- Stages only `data/snapshots/github/*.json` and
  `data/snapshots/github-refresh.json`.

- [ ] **Step 1: Write failing workflow contract tests**

```ts
test("uses status-driven refresh modes without indexed backfill", async () => {
  const refresh = await workflow("refresh-catalog");
  const source = await readFile(refreshPath, "utf8");
  const inputs = refresh.on.workflow_dispatch.inputs;

  expect(inputs.mode.options).toEqual([
    "incremental",
    "baseline",
    "project",
    "forensic",
  ]);
  expect(inputs.batch_size.default).toBe(12);
  expect(inputs).not.toHaveProperty("start_index");
  expect(source).not.toContain("next_index");
  expect(source).not.toContain("< 200");
  expect(source).toContain("evidence_status");
});

test("stages only snapshots and the refresh manifest", async () => {
  const source = await readFile(refreshPath, "utf8");
  expect(source).toContain("git add data/snapshots/github/*.json");
  expect(source).toContain("data/snapshots/github-refresh.json");
  expect(source).not.toMatch(/git add (?:data\/registry|data\/catalog)/);
});
```

Add tests for `npm run check`, serialized concurrency, deploy dispatch after
commit, baseline continuation after success only, and no force push.

- [ ] **Step 2: Run workflow tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: FAIL because the workflow still exposes incremental/backfill and a
hardcoded 200-record queue.

- [ ] **Step 3: Update workflow inputs and CLI arguments**

Use:

```yaml
workflow_dispatch:
  inputs:
    mode:
      type: choice
      options:
        - incremental
        - baseline
        - project
        - forensic
      default: incremental
    batch_size:
      type: number
      default: 12
    project_id:
      type: string
      required: false
```

Pass only mode, bounded batch size, and optional project ID.

- [ ] **Step 4: Make publication resilient to a moving main branch**

Before push, fetch and rebase with at most three attempts. Stop on a snapshot
conflict and name the conflicting files. Never force-push and never stage
registry content.

Use PowerShell-independent Bash in the Ubuntu workflow:

```bash
for attempt in 1 2 3; do
  if git fetch origin main &&
    git rebase origin/main &&
    git push origin HEAD:main; then
    break
  fi
  git rebase --abort || true
  if (( attempt == 3 )); then exit 1; fi
done
```

- [ ] **Step 5: Continue baselines dynamically**

After a successful commit, read the committed manifest:

```bash
remaining="$(
  node -e "const fs=require('fs');const value=JSON.parse(fs.readFileSync('data/snapshots/github-refresh.json','utf8')).counts.provisional;process.stdout.write(String(value))"
)"
if (( remaining > 0 )); then
  gh workflow run refresh-catalog.yml \
    --ref main \
    -f mode=baseline \
    -f batch_size="$BATCH_SIZE"
fi
```

Dispatch another baseline run only when at least one automatic project remains
provisional. Do not use array indexes or a catalog-size constant.

- [ ] **Step 6: Run workflow tests and formatting**

Run:

```powershell
npm.cmd test -- --run tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
npm.cmd exec -- prettier --check .github/workflows/refresh-catalog.yml tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: all tests and formatting checks pass.

- [ ] **Step 7: Commit the workflow**

```powershell
git add .github/workflows/refresh-catalog.yml tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
git commit -m "ci(catalog): drive dynamic baselines"
```

---

### Task 8: Update Operator Documentation and Run Full Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/github-refresh-methodology.md`
- Modify: `tests/visual/catalog.visual.spec.ts`
- Modify generated baselines only if intentional:
  `tests/visual/catalog.visual.spec.ts-snapshots/*.png`

**Interfaces:**
- Documents final CLI/workflow modes and activity semantics.
- Produces final repository-wide proof.

- [ ] **Step 1: Update activity and operator documentation**

Document:

```markdown
- `N/12` means source activity occurred in N of the current twelve fixed UTC
  weeks; it does not count commits.
- The twelve ticks run oldest to newest.
- Daily incremental refreshes batch metadata, compare changed heads, and clone
  only for baseline or fallback.
- `baseline` selects provisional snapshots dynamically.
- `project` refreshes one exact project.
- `forensic` forces one bounded Git inspection.
- A complete baseline with no qualifying change reports no source activity in
  the last twelve weeks.
```

Replace every operator example using `backfill`, `start_index`, or the 200-item
queue. Explain the global refresh manifest and the action's final timing table.

- [ ] **Step 2: Search for obsolete contracts**

Run:

```powershell
rg -n -i 'depth=500|backfill.*start|start_index|next_index|< 200|weekly_meaningful_commits|latest_meaningful_commit_at|Activity Strength|sort=strength|Last commit' README.md docs/architecture/github-refresh-methodology.md scripts src tests data/schemas .github
```

Expected: no production or current-documentation matches. Historical approved
specs/plans may retain old wording as historical records and should not be
rewritten.

- [ ] **Step 3: Run unit and integration checks**

Run:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run palette:audit
npm.cmd run catalog:validate
npm.cmd run catalog:build
npm.cmd run typecheck
npm.cmd test
```

Expected: every command passes.

- [ ] **Step 4: Run static build and browser tests**

Run:

```powershell
npm.cmd run build
npm.cmd run verify:export
npm.cmd run test:e2e
npm.cmd run test:visual
```

Expected: static export, end-to-end behavior, responsive layouts, accessibility
contracts, and committed visual baselines pass.

If only the six-to-twelve activity graph intentionally changes screenshots,
inspect every desktop, tablet, mobile, compact, and bounded diff before
updating baselines. Do not approve unrelated visual movement.

- [ ] **Step 5: Run the aggregate gate**

Run:

```powershell
npm.cmd run check
```

Expected: exit code `0`.

- [ ] **Step 6: Verify repository state and diff scope**

Run:

```powershell
git status --short
git diff --check
git diff --stat HEAD~8
```

Expected: only planned catalog refresh, activity UI, tests, generated snapshots,
workflow, and documentation changes remain; no temporary clone or staging
directory is tracked.

- [ ] **Step 7: Commit documentation and intentional visual baselines**

```powershell
git add README.md docs/architecture/github-refresh-methodology.md tests/visual/catalog.visual.spec.ts tests/visual/catalog.visual.spec.ts-snapshots
git commit -m "docs(catalog): explain incremental refresh"
```

- [ ] **Step 8: Record live GitHub proof after pushing**

Run the GitHub workflow in this order:

1. `project` for one repository with an unchanged head; confirm zero clones.
2. `project` or `forensic` for one changed repository; confirm compare or one
   bounded fallback and visible per-project timing.
3. `baseline` with batch size `12`; confirm status-driven continuation.
4. `incremental`; confirm batched metadata, no hardcoded ceiling, valid
   manifest, successful snapshot commit, and Pages dispatch.

Record the Actions run URLs and final Pages URL in the implementation handoff.
Do not claim live proof from mocked tests alone.
