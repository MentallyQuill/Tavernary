# Frontend Submission Dependency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Extension and dependent-Preset issues open when they reference an unindexed frontend, require that frontend to complete its own review first, and retry only matching blocked issues after the frontend reaches `main`.

**Architecture:** Frontend reconciliation will return canonical missing-frontend dependencies as structured data alongside ordinary correction errors. Triage will persist those dependencies in its stable issue-comment marker and render actionable prerequisite copy. A small read-only retry service, invoked by a `main`-branch catalog workflow, will locate matching blocked issues and dispatch their existing idempotent triage workflow.

**Tech Stack:** Node.js 24 ESM, TypeScript declaration files, Vitest, React 19, Testing Library, Playwright, GitHub Actions, GitHub REST API.

## Global Constraints

- Extensions and frontend-dependent System Presets must declare at least one supported frontend.
- No frontend is selected by default.
- Every claimed frontend must already resolve to Tavernary before the dependent project can reach maintainer review.
- An unknown frontend must never create a frontend record, issue, vocabulary entry, or pull request automatically.
- The dependent project issue remains open with `needs-information`.
- Every missing frontend requires an exact public GitHub owner/repository URL.
- Retry state is structured and versioned; automation must never parse human-facing comment prose.
- Retry is targeted by canonical frontend repository identity.
- Multiple missing frontends keep the issue blocked until every dependency resolves.
- Closed dependent issues are never reopened.
- Existing triage comments, labels, branch creation, and pull-request generation remain idempotent.
- Preserve the native GitHub fallback form and apply the same server-side policy to its manifests.
- Do not replace the compatibility multi-select with a singular dropdown.
- Do not modify or stage the unrelated `docs/superpowers/plans/2026-07-26-github-workflow-naming.md` worktree file.

## File Structure

- `scripts/submissions/frontend-reconciliation.mjs` — resolve submitted frontend claims and classify valid unknown GitHub repositories as blocked dependencies.
- `scripts/submissions/frontend-reconciliation.d.mts` — publish the exact dependency and resolution unions.
- `scripts/submissions/admission.mjs` — preserve dependency data when converting reconciliation into an admission decision.
- `scripts/submissions/admission.d.mts` — publish dependency-bearing `needs-information` decisions.
- `scripts/submissions/triage-issue.mjs` — persist dependency markers and render the prerequisite response.
- `scripts/submissions/triage-issue.d.mts` — publish the extended marker contract.
- `scripts/submissions/retry-frontend-dependencies.mjs` — query blocked issues, match canonical dependency URLs, and dispatch ordinary triage.
- `scripts/submissions/retry-frontend-dependencies.d.mts` — publish pure-selection and orchestrator interfaces.
- `.github/workflows/retry-frontend-dependencies.yml` — run targeted retry checks when frontend identity data reaches `main`.
- `src/features/submissions/components/project-submission-builder.tsx` — explain the prerequisite and require an exact GitHub repository for an unlisted frontend.
- `tests/unit/frontend-reconciliation.test.ts` — prove dependency classification and hard admission gating.
- `tests/unit/project-submission-admission.test.ts` — prove dependency propagation through the admission boundary.
- `tests/unit/triage-issue.test.ts` — prove marker persistence, actionable copy, and clearing behavior.
- `tests/unit/retry-frontend-dependencies.test.ts` — prove canonical matching, pagination, dispatch targeting, and idempotent selection.
- `tests/unit/workflows.test.ts` — prove workflow triggers, permissions, pinned actions, and read-only behavior.
- `tests/unit/project-submission-builder.test.tsx` — prove the unlisted-frontend explanation and exact repository validation.
- `tests/e2e/project-submission.spec.ts` — prove zero-default selection and the rendered dependency path.

---

### Task 1: Classify Unknown Frontends as Structured Dependencies

**Files:**
- Modify: `scripts/submissions/frontend-reconciliation.mjs`
- Modify: `scripts/submissions/frontend-reconciliation.d.mts`
- Modify: `scripts/submissions/admission.mjs`
- Modify: `scripts/submissions/admission.d.mts`
- Test: `tests/unit/frontend-reconciliation.test.ts`
- Test: `tests/unit/project-submission-admission.test.ts`

**Interfaces:**
- Consumes: `parseSourceIdentity(url: string): SourceIdentity` and existing `FrontendReconciliationInput`.
- Produces:

```ts
export interface MissingFrontendDependency {
  name: string;
  canonicalUrl: string;
  repository: string;
}

export type FrontendResolution =
  | { status: "resolved"; ids: string[]; warnings: string[] }
  | {
      status: "needs-information";
      errors: string[];
      suggestions: FrontendSuggestion[];
      dependencies: MissingFrontendDependency[];
    };
```

- Produces: every `ProjectSubmissionDecision` with `status: "needs-information"` has `frontendDependencies: MissingFrontendDependency[]`.

- [ ] **Step 1: Write failing reconciliation tests**

Add focused cases to `tests/unit/frontend-reconciliation.test.ts`:

```ts
test("classifies an unknown GitHub frontend as a dependency", () => {
  expect(
    reconcileFrontends({
      projectType: "extension",
      knownIds: ["sillytavern"],
      other: [
        {
          name: "Aikobots",
          url: "https://github.com/aikohanasaki/Aikobots",
        },
      ],
      frontendIndependent: false,
      vocabulary,
      frontendProjects,
    }),
  ).toEqual({
    status: "needs-information",
    errors: [
      "Aikobots is not currently indexed as a Tavernary frontend.",
    ],
    suggestions: [],
    dependencies: [
      {
        name: "Aikobots",
        canonicalUrl: "https://github.com/aikohanasaki/Aikobots",
        repository: "aikohanasaki/Aikobots",
      },
    ],
  });
});

test("rejects an unlisted frontend without an exact GitHub repository", () => {
  const result = reconcileFrontends({
    projectType: "extension",
    knownIds: [],
    other: [{ name: "Aikobots", url: "https://www.aikobots.com/" }],
    frontendIndependent: false,
    vocabulary,
    frontendProjects,
  });

  expect(result).toEqual({
    status: "needs-information",
    errors: [
      "Aikobots needs an exact public GitHub owner/repository URL before it can be submitted as a frontend.",
    ],
    suggestions: [],
    dependencies: [],
  });
});
```

Update all existing `needs-information` expectations in this file to include
`dependencies: []`.

- [ ] **Step 2: Write a failing admission propagation test**

In `tests/unit/project-submission-admission.test.ts`, construct an otherwise
valid submission and assert:

```ts
expect(
  evaluateProjectSubmission({
    ...admittedFixture({
      frontendResolution: {
        status: "needs-information",
        errors: [
          "Aikobots is not currently indexed as a Tavernary frontend.",
        ],
        suggestions: [],
        dependencies: [
          {
            name: "Aikobots",
            canonicalUrl: "https://github.com/aikohanasaki/Aikobots",
            repository: "aikohanasaki/Aikobots",
          },
        ],
      },
    }),
  }),
).toMatchObject({
  status: "needs-information",
  frontendDependencies: [
    {
      name: "Aikobots",
      canonicalUrl: "https://github.com/aikohanasaki/Aikobots",
      repository: "aikohanasaki/Aikobots",
    },
  ],
});
```

Also update existing non-frontend `needs-information` expectations to contain
`frontendDependencies: []`.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/frontend-reconciliation.test.ts tests/unit/project-submission-admission.test.ts
```

Expected: FAIL because `dependencies` and `frontendDependencies` do not yet
exist and unknown frontends still emit only `Unknown frontend`.

- [ ] **Step 4: Implement canonical dependency classification**

In `frontend-reconciliation.mjs`, add a helper that accepts only a GitHub
repository identity:

```js
function missingFrontendDependency(submitted) {
  if (!submitted.url?.trim()) return null;
  try {
    const identity = parseSourceIdentity(submitted.url.trim());
    if (identity.kind !== "github") return null;
    return {
      name: submitted.name?.trim() || identity.repository,
      canonicalUrl: identity.canonicalUrl,
      repository: identity.repository,
    };
  } catch {
    return null;
  }
}
```

For each unresolved `other` entry:

- preserve exact/alias/URL/close-match resolution first;
- append a valid GitHub identity to `dependencies`;
- otherwise append the exact-repository correction error;
- do not treat a dependency as a resolved frontend ID; and
- return every accumulated dependency when status is `needs-information`.

Every other `needs-information` return must include `dependencies: []`.

Do not convert unknown `knownIds` into dependencies because those claims have
no canonical repository identity.

- [ ] **Step 5: Propagate dependencies through admission**

Change the `needs-information` branch in `evaluateProjectSubmission` to return:

```js
return {
  status: "needs-information",
  errors: input.frontendResolution.errors,
  suggestions: input.frontendResolution.suggestions,
  frontendDependencies: input.frontendResolution.dependencies,
};
```

All earlier `needs-information` branches that do not originate from frontend
reconciliation return `frontendDependencies: []`.

Mirror the exact interfaces in both `.d.mts` files.

- [ ] **Step 6: Run focused tests and type checking**

Run:

```powershell
npm.cmd test -- tests/unit/frontend-reconciliation.test.ts tests/unit/project-submission-admission.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the reconciliation boundary**

```powershell
git add scripts/submissions/frontend-reconciliation.mjs scripts/submissions/frontend-reconciliation.d.mts scripts/submissions/admission.mjs scripts/submissions/admission.d.mts tests/unit/frontend-reconciliation.test.ts tests/unit/project-submission-admission.test.ts
git commit -m "feat(submissions): classify frontend dependencies"
```

---

### Task 2: Persist Dependencies and Explain the Prerequisite

**Files:**
- Modify: `scripts/submissions/triage-issue.mjs`
- Modify: `scripts/submissions/triage-issue.d.mts`
- Test: `tests/unit/triage-issue.test.ts`

**Interfaces:**
- Consumes: `ProjectSubmissionDecision.frontendDependencies`.
- Produces:

```ts
export interface ProjectSubmissionStateMarker {
  schema_version: 1;
  generated_title: string | null;
  status: ProjectSubmissionDecision["status"];
  frontend_dependencies?: Array<{
    name: string;
    canonical_url: string;
    repository: string;
  }>;
}
```

- Produces: `parseProjectSubmissionStateMarker(body)` accepts old schema-version
  1 markers without `frontend_dependencies` and validates every new dependency
  entry.

- [ ] **Step 1: Write failing marker tests**

Add tests proving old markers still parse and new markers round-trip:

```ts
test("parses structured frontend dependencies from the stable marker", () => {
  const body = [
    "<!-- tavernary-project-submission-state",
    JSON.stringify({
      schema_version: 1,
      generated_title:
        "[Project submission] aikohanasaki/SillyTavern-WorldInfoLocks",
      status: "needs-information",
      frontend_dependencies: [
        {
          name: "Aikobots",
          canonical_url: "https://github.com/aikohanasaki/Aikobots",
          repository: "aikohanasaki/Aikobots",
        },
      ],
    }),
    "-->",
  ].join("\n");

  expect(parseProjectSubmissionStateMarker(body)).toMatchObject({
    frontend_dependencies: [
      {
        name: "Aikobots",
        canonical_url: "https://github.com/aikohanasaki/Aikobots",
      },
    ],
  });
});
```

Add malformed-entry cases that return `null`, while preserving the existing
old-marker success case.

- [ ] **Step 2: Write a failing issue-response test**

Build a `needs-information` decision with one dependency and assert that
`buildProjectSubmissionTriage`:

- keeps the issue open;
- retains `needs-information`;
- does not dispatch generation;
- stores the dependency in the marker; and
- contains the frontend submission link and automatic-retry promise.

Use this exact user-facing core copy:

```text
**Aikobots is not currently indexed as a Tavernary frontend.**

Extensions and presets can only reference frontends that have completed Tavernary review. [Submit Aikobots as a frontend first](https://github.com/MentallyQuill/Tavernary/issues/new?template=01-project-submission.yml&project-type=Frontend&project-url=https%3A%2F%2Fgithub.com%2Faikohanasaki%2FAikobots). This issue will remain open and retry automatically after that frontend is merged.
```

The direct GitHub Issue Form URL is intentional: it works from an issue comment
without depending on a deployment base path and prefills the required frontend
type and repository URL.

- [ ] **Step 3: Run the triage test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/triage-issue.test.ts
```

Expected: FAIL because the marker does not store dependencies and the current
comment only says `Unknown frontend`.

- [ ] **Step 4: Validate optional dependency marker data**

Extend `parseProjectSubmissionStateMarker` so:

- an absent `frontend_dependencies` property is accepted as `[]`;
- a present value must be an array;
- every entry must contain non-empty `name`, `canonical_url`, and `repository`
  strings; and
- invalid marker data returns `null`.

Normalize the returned marker to include `frontend_dependencies: []` so retry
code has one stable shape.

- [ ] **Step 5: Build the dependency response and marker**

Add a small `frontendDependencyComment(dependency)` formatter. Construct the
prefilled URL with `URL` and `searchParams`; do not concatenate or interpolate
untrusted repository data into a raw query string.

In `buildProjectSubmissionTriage`, map
`decision.frontendDependencies ?? []` to marker keys:

```js
frontend_dependencies: dependencies.map((dependency) => ({
  name: dependency.name,
  canonical_url: dependency.canonicalUrl,
  repository: dependency.repository,
})),
```

For dependency-bearing `needs-information` decisions:

- render the prerequisite blocks first;
- render any remaining correction errors after them without duplicating the
  dependency headline;
- end with the promise that the issue remains open and retries automatically;
- keep `close: false`; and
- keep `dispatchGeneration: false`.

Generic `needs-information` decisions retain the existing edit-and-rerun
instruction.

- [ ] **Step 6: Update internal invalid-resolution construction**

In `processProjectSubmissionTriage`, add `dependencies: []` to the
manifest-invalid `frontendResolution` literal so it satisfies the Task 1
contract. Update all test fixtures that construct `needs-information`
decisions directly with `frontendDependencies: []`.

- [ ] **Step 7: Run focused tests and type checking**

Run:

```powershell
npm.cmd test -- tests/unit/triage-issue.test.ts tests/unit/project-submission-admission.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit issue-state behavior**

```powershell
git add scripts/submissions/triage-issue.mjs scripts/submissions/triage-issue.d.mts tests/unit/triage-issue.test.ts tests/unit/project-submission-admission.test.ts
git commit -m "feat(submissions): explain frontend prerequisite"
```

---

### Task 3: Select and Dispatch Targeted Retries

**Files:**
- Create: `scripts/submissions/retry-frontend-dependencies.mjs`
- Create: `scripts/submissions/retry-frontend-dependencies.d.mts`
- Create: `tests/unit/retry-frontend-dependencies.test.ts`

**Interfaces:**
- Consumes: `parseProjectSubmissionStateMarker(body)` and frontend project
  records shaped as `FrontendProject`.
- Produces:

```ts
export interface RetryIssue {
  number: number;
  state: string;
  labels: Array<string | { name: string }>;
}

export function indexedFrontendUrls(
  projects: FrontendProject[],
): Set<string>;

export function hasResolvableFrontendDependency(input: {
  comments: Array<{ body?: string | null }>;
  indexedUrls: Set<string>;
}): boolean;

export function retryFrontendDependencies(input: {
  repository: string;
  ref?: string;
  projects: FrontendProject[];
  request: (
    path: string,
    options?: { method?: string; body?: string },
  ) => Promise<any>;
}): Promise<number[]>;
```

- [ ] **Step 1: Write failing pure-selection tests**

Create `tests/unit/retry-frontend-dependencies.test.ts` with:

```ts
test("matches dependencies by canonical repository URL", () => {
  const indexedUrls = indexedFrontendUrls([
    {
      id: "aikobots",
      name: "Aikobots",
      kind: "frontend",
      source: { type: "github", repository: "aikohanasaki/Aikobots" },
      frontends: ["aikobots"],
    },
  ]);

  expect(
    hasResolvableFrontendDependency({
      indexedUrls,
      comments: [
        {
          body: markerComment([
            {
              name: "Aikobots",
              canonical_url: "https://github.com/AIKOHANASAKI/Aikobots/",
              repository: "aikohanasaki/Aikobots",
            },
          ]),
        },
      ],
    }),
  ).toBe(true);
});
```

Also cover:

- no state marker;
- malformed marker;
- an unrelated indexed frontend;
- multiple dependencies where one newly resolves; and
- non-frontend project records.

- [ ] **Step 2: Write a failing orchestration test**

Mock paginated GitHub REST responses and assert that
`retryFrontendDependencies`:

- requests only open issues labeled `project-submission` and
  `needs-information`;
- reads comments for each candidate;
- ignores closed or nonmatching issues defensively;
- dispatches `triage-submission.yml` only for matching issue numbers;
- sends `{ ref: "main", inputs: { issue_number: "23" } }`; and
- returns the dispatched numbers.

Use the REST dispatch path:

```text
/repos/MentallyQuill/Tavernary/actions/workflows/triage-submission.yml/dispatches
```

- [ ] **Step 3: Run the new test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/retry-frontend-dependencies.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement canonical frontend URL indexing**

Build a lowercase URL set only from records where:

```js
project.kind === "frontend" &&
project.source?.type === "github" &&
typeof project.source.repository === "string"
```

Canonicalize through `parseSourceIdentity` rather than comparing submitted
strings directly.

- [ ] **Step 5: Implement marker selection**

Find the stable marker by passing each comment body to
`parseProjectSubmissionStateMarker`. A candidate matches when:

- its parsed marker status is `needs-information`;
- `frontend_dependencies` is non-empty; and
- at least one dependency canonical URL exists in `indexedUrls`.

Matching one dependency is enough to rerun ordinary triage. Triage will rewrite
the marker and keep the issue blocked if other dependencies remain.

- [ ] **Step 6: Implement paginated retry orchestration**

Fetch candidate issues in pages of 100 until a short page is returned:

```text
/repos/{repository}/issues?state=open&labels=project-submission%2Cneeds-information&per_page=100&page={page}
```

GitHub's Issues endpoint can return pull requests; ignore entries containing a
`pull_request` property.

For each matching issue, dispatch the existing triage workflow through the REST
Actions endpoint. Dispatch each issue at most once per run, even when several
comments or dependencies match.

The CLI entry point reads:

- `GITHUB_REPOSITORY`;
- `GITHUB_TOKEN`;
- optional `GITHUB_REF_NAME`, defaulting to `main`; and
- current catalog data from `loadProjectSubmissionCatalogData()`.

Use the repository's existing bounded GitHub-request pattern; never place the
token in a URL or log.

- [ ] **Step 7: Run focused tests, lint, and type checking**

Run:

```powershell
npm.cmd test -- tests/unit/retry-frontend-dependencies.test.ts
npm.cmd run lint
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit the retry service**

```powershell
git add scripts/submissions/retry-frontend-dependencies.mjs scripts/submissions/retry-frontend-dependencies.d.mts tests/unit/retry-frontend-dependencies.test.ts
git commit -m "feat(submissions): retry frontend dependents"
```

---

### Task 4: Trigger Retry Checks from Frontend Identity Changes

**Files:**
- Create: `.github/workflows/retry-frontend-dependencies.yml`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**
- Consumes: `node scripts/submissions/retry-frontend-dependencies.mjs`.
- Produces: a read-only `main` push workflow with `contents: read`,
  `issues: read`, and `actions: write`.

- [ ] **Step 1: Write a failing workflow-contract test**

Extend the workflow name, run-name, and pinned-action tables with:

```ts
"retry-frontend-dependencies":
  "Project submissions: Retry frontend dependencies"
```

Add a focused test asserting:

```ts
expect(retry.on.push.branches).toEqual(["main"]);
expect(retry.on.push.paths).toEqual(
  expect.arrayContaining([
    "data/registry/projects/**",
    "data/vocabularies/frontends.json",
  ]),
);
expect(retry.on.workflow_dispatch).toBeDefined();
expect(retry.permissions).toEqual({
  contents: "read",
  issues: "read",
  actions: "write",
});
expect(source).toContain(
  "node scripts/submissions/retry-frontend-dependencies.mjs",
);
expect(source).not.toMatch(/\bgit (?:add|commit|push)\b/);
```

Also assert concurrency is:

```ts
{
  group: "retry-frontend-dependencies",
  "cancel-in-progress": false,
}
```

- [ ] **Step 2: Run the workflow test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Add the retry workflow**

Create `.github/workflows/retry-frontend-dependencies.yml` with:

```yaml
name: "Project submissions: Retry frontend dependencies"
run-name: "Project submissions: Retry merged frontend dependencies"

on:
  push:
    branches:
      - main
    paths:
      - "data/registry/projects/**"
      - "data/vocabularies/frontends.json"
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  actions: write

concurrency:
  group: retry-frontend-dependencies
  cancel-in-progress: false

jobs:
  retry:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24
      - name: Retry matching blocked submissions
        run: node scripts/submissions/retry-frontend-dependencies.mjs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The broad registry path may wake the workflow for a non-frontend record, but
Task 3 dispatches no issue unless a stored dependency resolves against the
current frontend records. It never reruns the whole blocked queue.

- [ ] **Step 4: Run workflow and submission tests**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts tests/unit/retry-frontend-dependencies.test.ts
npm.cmd run format:check
```

Expected: PASS.

- [ ] **Step 5: Commit the workflow**

```powershell
git add .github/workflows/retry-frontend-dependencies.yml tests/unit/workflows.test.ts
git commit -m "ci(submissions): retry merged frontend deps"
```

---

### Task 5: Make the Missing-Frontend Path Explicit in the Builder

**Files:**
- Modify: `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `tests/unit/project-submission-builder.test.tsx`
- Modify: `tests/e2e/project-submission.spec.ts`

**Interfaces:**
- Consumes: existing `isGithubRepositoryUrl(value: string): boolean`.
- Produces: unlisted-frontend copy and client validation consistent with the
  server dependency contract.

- [ ] **Step 1: Write failing component tests**

Extend `tests/unit/project-submission-builder.test.tsx` to assert:

```ts
await user.selectOptions(screen.getByLabelText("Project Type"), "extension");

expect(screen.getByText("0 selected")).toBeVisible();
expect(screen.getByLabelText("SillyTavern")).not.toBeChecked();

await user.click(screen.getByLabelText("Other or not listed"));

expect(
  screen.getByText(
    "This project will stay blocked until the missing frontend is submitted, reviewed, and merged.",
  ),
).toBeVisible();
```

Change the existing `http://example.com/frontend` test and add a non-repository
HTTPS case. Both must render:

```text
Other frontend URL must be an exact public GitHub owner/repository URL.
```

Keep a passing case for
`https://github.com/aikohanasaki/Aikobots`.

- [ ] **Step 2: Write a failing rendered-flow test**

In `tests/e2e/project-submission.spec.ts`:

- select `Extension`;
- verify zero selected frontends;
- select only **Other or not listed**;
- fill Aikobots name and repository;
- submit through the mocked `window.open`; and
- assert the prefilled manifest contains Aikobots under `frontends.other`, not
  `known_ids`.

Also assert the prerequisite explanation is visible before submission.

- [ ] **Step 3: Run component tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-builder.test.tsx
```

Expected: FAIL because the prerequisite explanation and exact-GitHub
validation are absent.

- [ ] **Step 4: Implement builder copy and validation**

Change the **Other or not listed** hint to:

```text
Tell us about a frontend missing from the catalog.
```

Inside the revealed field group add:

```text
This project will stay blocked until the missing frontend is submitted, reviewed, and merged.
```

Validate `otherFrontendUrl` with `isGithubRepositoryUrl`, not merely
`publicHttpsUrl`, and use the exact error:

```text
Other frontend URL must be an exact public GitHub owner/repository URL.
```

Do not preselect a frontend, remove multi-selection, or prevent a valid
unknown dependency from opening its durable GitHub issue.

- [ ] **Step 5: Run unit tests, rebuild, and run the rendered test**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-builder.test.tsx
npm.cmd run build
npm.cmd run test:e2e -- tests/e2e/project-submission.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the builder contract**

```powershell
git add src/features/submissions/components/project-submission-builder.tsx tests/unit/project-submission-builder.test.tsx tests/e2e/project-submission.spec.ts
git commit -m "feat(submissions): clarify missing frontends"
```

---

### Task 6: Run Integrated Verification and Prove Issue Recovery

**Files:**
- Modify only if verification exposes a scoped defect in files already named
  by Tasks 1–5.
- Do not change the approved design or unrelated worktree files to make a test
  pass.

**Interfaces:**
- Consumes: the complete Task 1–5 behavior.
- Produces: local gate evidence and, after the implementation reaches `main`,
  live issue evidence for the dependency/retry lifecycle.

- [ ] **Step 1: Run all focused submission tests**

Run:

```powershell
npm.cmd test -- tests/unit/frontend-reconciliation.test.ts tests/unit/project-submission-admission.test.ts tests/unit/triage-issue.test.ts tests/unit/retry-frontend-dependencies.test.ts tests/unit/workflows.test.ts tests/unit/project-submission-builder.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the repository verification gate**

Run:

```powershell
npm.cmd run check
```

Expected: PASS. If a pre-existing unrelated failure occurs, record its exact
test and prove the focused submission suite separately; do not overwrite the
unrelated dirty plan file.

- [ ] **Step 3: Review the complete implementation diff**

Run:

```powershell
git diff main...HEAD --check
git diff main...HEAD --stat
git status --short
```

Expected:

- no whitespace errors;
- only the files named by this plan plus its approved spec/plan commits; and
- `docs/superpowers/plans/2026-07-26-github-workflow-naming.md` remains
  untracked and unstaged.

- [ ] **Step 4: After the implementation reaches `main`, retriage issue #23**

Issue #23 predates the structured dependency marker. Dispatch its existing
triage workflow once so it receives the new state:

```powershell
gh workflow run triage-submission.yml --repo MentallyQuill/Tavernary --ref main -f issue_number=23
gh run watch --repo MentallyQuill/Tavernary
gh issue view 23 --repo MentallyQuill/Tavernary --comments
```

Expected:

- issue #23 remains open;
- `needs-information` remains;
- the stable action comment identifies Aikobots as a prerequisite;
- the comment links to a prefilled Frontend submission; and
- no WorldInfoLocks review pull request exists yet.

- [ ] **Step 5: Prove targeted automatic retry with a controlled frontend**

After the Aikobots frontend submission is reviewed and merged, observe
`Project submissions: Retry frontend dependencies`.

Run:

```powershell
gh run list --repo MentallyQuill/Tavernary --workflow retry-frontend-dependencies.yml --limit 5
gh issue view 23 --repo MentallyQuill/Tavernary --comments
gh pr list --repo MentallyQuill/Tavernary --state open --search "WorldInfoLocks"
```

Expected:

- the retry workflow dispatches triage for issue #23;
- the dependency disappears from its stable marker;
- `needs-information` clears;
- the original issue advances without resubmission; and
- exactly one generated WorldInfoLocks review pull request exists.

- [ ] **Step 6: Record any verification-only repair**

If Steps 1–5 required a scoped repair, rerun the failing command and commit only
that repair:

```powershell
git add scripts/submissions/frontend-reconciliation.mjs scripts/submissions/frontend-reconciliation.d.mts scripts/submissions/admission.mjs scripts/submissions/admission.d.mts scripts/submissions/triage-issue.mjs scripts/submissions/triage-issue.d.mts scripts/submissions/retry-frontend-dependencies.mjs scripts/submissions/retry-frontend-dependencies.d.mts .github/workflows/retry-frontend-dependencies.yml src/features/submissions/components/project-submission-builder.tsx tests/unit/frontend-reconciliation.test.ts tests/unit/project-submission-admission.test.ts tests/unit/triage-issue.test.ts tests/unit/retry-frontend-dependencies.test.ts tests/unit/workflows.test.ts tests/unit/project-submission-builder.test.tsx tests/e2e/project-submission.spec.ts
git commit -m "fix(submissions): harden frontend retry"
```

If no repair was required, do not create an empty verification commit.
