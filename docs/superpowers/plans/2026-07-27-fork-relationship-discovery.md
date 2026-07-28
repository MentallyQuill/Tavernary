# Fork Relationship Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Observe immediate GitHub fork parents, review missing ancestors before submitted children, and provide a reversible two-card parent/child relationship filter.

**Architecture:** GitHub observations persist the immediate parent by stable repository ID. Catalog generation resolves that private observation into a deliberately smaller public relationship object, while submission triage creates or reuses normal project-submission issues for missing parents and retries waiting children after parent review. The browser represents a relationship as a URL-addressable child ID, derives the parent from generated data, and displays the normal parent card before the normal child card.

**Tech Stack:** Node.js 24 ESM, GitHub GraphQL and REST APIs, JSON Schema with Ajv, GitHub Actions, Next.js 16, React 19, TypeScript 6, Vitest, Testing Library, Playwright, static GitHub Pages export.

## Global Constraints

- Relationships represent exactly one immediate GitHub parent; never substitute the root source repository.
- Parent cards never list children, child counts, siblings, or fork families.
- Relationship results contain exactly the published parent and selected child.
- Desktop order is parent left and child right; mobile DOM and visual order are parent then child.
- Delisted parents expose a last-known name only: no GitHub URL, relationship action, or public project ID.
- A child remains valid and published when its parent is not listed.
- Missing parents use the ordinary maintainer-reviewed project submission flow; no parent is auto-published.
- Ancestor discovery is metadata-only, cycle-safe, and stops after 16 immediate-parent hops.
- The relationship URL preserves ordinary query parameters while suspending their effect on the two-card result set.
- Removing the relationship token restores preserved query state; `Clear all` and `Clear filters` remove every filter and scope.
- Use existing catalog cards and active-query controls; do not add a banner, modal, tree, connector graphic, or role heading.
- Do not expose GitHub repository coordinates from browser-ready data for non-published parents.
- Preserve unrelated worktree changes and do not edit `src/generated/catalog.json` by hand.

---

## File Structure

### New files

- `scripts/catalog/fork-relationship.mjs` — resolve private snapshot parent facts into the minimal public relationship object.
- `scripts/submissions/fork-dependency.mjs` — classify an upstream, render a system-created upstream issue, and idempotently create or reuse that issue.
- `scripts/submissions/fork-dependency.d.mts` — declarations for the submission dependency module.
- `scripts/submissions/retry-fork-dependencies.mjs` — find waiting child issues whose upstream reached a terminal outcome and dispatch ordinary triage.
- `scripts/submissions/retry-fork-dependencies.d.mts` — declarations for targeted retry.
- `.github/workflows/retry-fork-dependencies.yml` — trigger targeted retry after registry changes or upstream review closure.
- `scripts/submissions/backfill-fork-dependencies.mjs` — dry-run-first backfill for already-cataloged forks with unknown parents.
- `scripts/submissions/backfill-fork-dependencies.d.mts` — declarations for backfill planning.
- `src/features/catalog/components/project-relationship-control.tsx` — accessible sibling overlay for relationship text/action without nesting a button in the card anchor.
- `tests/unit/fork-relationship.test.ts` — build-time public-resolution contract.
- `tests/unit/fork-dependency.test.ts` — upstream classification, issue rendering, reuse, and creation.
- `tests/unit/retry-fork-dependencies.test.ts` — retry selection and dispatch.
- `tests/unit/backfill-fork-dependencies.test.ts` — bounded, deduplicated existing-catalog backfill.
- `tests/unit/use-catalog-query.test.tsx` — relationship push/back/direct-link history behavior.

### Existing files with focused modifications

- `scripts/catalog/github-observer.mjs`
- `scripts/catalog/repository-snapshot.mjs`
- `scripts/catalog/build.mjs`
- `scripts/catalog/validate.mjs`
- `data/schemas/repository-snapshot.schema.json`
- `docs/reference/repository-snapshot-schema.md`
- `scripts/submissions/admission.mjs`
- `scripts/submissions/triage-issue.mjs`
- `scripts/submissions/project-submission-lifecycle.mjs`
- `scripts/submissions/project-submission-lifecycle.d.mts`
- `.github/workflows/triage-submission.yml`
- `.github/workflows/project-submission-lifecycle.yml`
- `src/features/catalog/catalog-types.ts`
- `src/features/catalog/catalog-query.ts`
- `src/features/catalog/catalog-selectors.ts`
- `src/features/catalog/use-catalog-query.ts`
- `src/features/catalog/components/active-query.tsx`
- `src/features/catalog/components/catalog-page.tsx`
- `src/features/catalog/components/project-grid.tsx`
- `src/styles/catalog.css`
- `tests/unit/github-observer.test.ts`
- `tests/unit/repository-snapshot.test.ts`
- `tests/unit/validate-catalog.test.ts`
- `tests/unit/build-catalog.test.ts`
- `tests/unit/project-submission-admission.test.ts`
- `tests/unit/triage-issue.test.ts`
- `tests/unit/project-submission-lifecycle.test.ts`
- `tests/unit/workflows.test.ts`
- `tests/unit/catalog-selectors.test.ts`
- `tests/unit/project-card.test.tsx`
- `tests/unit/catalog-license-filter-contract.test.tsx`
- `tests/unit/visual-alignment-contract.test.ts`
- `tests/e2e/catalog.spec.ts`
- `tests/visual/catalog.visual.spec.ts`
- `docs/architecture/catalog-lifecycle.md`
- `docs/contributing/submission-and-review.md`
- `docs/maintenance/operations-runbook.md`

The worktree contained unrelated contextual-frontend-eligibility edits when
this plan was written. Do not overwrite, stage, or fold those changes into this
feature. At execution time, start from the updated branch that owns those edits
and re-read overlapping submission seams before the first production patch.

---

### Task 1: Observe and persist the immediate GitHub parent

**Files:**

- Modify: `scripts/catalog/github-observer.mjs`
- Modify: `scripts/catalog/repository-snapshot.mjs`
- Modify: `data/schemas/repository-snapshot.schema.json`
- Modify: `docs/reference/repository-snapshot-schema.md`
- Test: `tests/unit/github-observer.test.ts`
- Test: `tests/unit/repository-snapshot.test.ts`
- Test: `tests/unit/validate-catalog.test.ts`

**Interfaces:**

- Consumes: GitHub GraphQL `Repository.isFork` and `Repository.parent`.
- Produces:

```ts
interface RepositoryParentObservation {
  id: number;
  owner: string;
  name: string;
  url: string;
}

interface ObservedRepository {
  // existing fields
  fork: boolean;
  parent: RepositoryParentObservation | null;
}
```

- Persists:

```json
{
  "repository": {
    "fork": true,
    "parent": {
      "id": 123456,
      "owner": "Coneja-Chibi",
      "name": "VectHare",
      "url": "https://github.com/Coneja-Chibi/VectHare"
    }
  }
}
```

- [ ] **Step 1: Add failing GraphQL observer tests**

Add fixtures with `isFork: true` and:

```ts
parent: {
  databaseId: 9001,
  name: "VectHare",
  nameWithOwner: "Coneja-Chibi/VectHare",
  url: "https://github.com/Coneja-Chibi/VectHare",
}
```

Assert that the query requests `parent`, the observation maps the stable ID and
identity, a non-fork maps `parent: null`, and malformed or self-parent data is
rejected as malformed GitHub repository data.

- [ ] **Step 2: Run the observer test and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/github-observer.test.ts
```

Expected: FAIL because the observer does not request or return `parent`.

- [ ] **Step 3: Implement strict parent parsing**

Extend `repositorySelection()` with:

```graphql
parent {
  databaseId
  name
  nameWithOwner
  url
}
```

Add a focused parser that returns `null` for a non-fork and requires a valid,
non-self parent for a fork when GitHub supplies one. Keep `parent: null` valid
for a fork whose parent is unavailable.

- [ ] **Step 4: Add failing snapshot and schema tests**

Assert:

- `repositoryFacts()` persists the snake-case parent object;
- legacy observations without `parent` remain valid and normalize to `null`;
- a refresh that temporarily omits a known fork parent retains the previous
  validated parent instead of erasing last-known provenance;
- the JSON schema accepts valid parent facts;
- invalid IDs, malformed coordinates, extra properties, and self-links fail.

- [ ] **Step 5: Run snapshot/schema tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/repository-snapshot.test.ts tests/unit/validate-catalog.test.ts
```

Expected: FAIL because the snapshot and schema do not accept `parent`.

- [ ] **Step 6: Persist and validate the parent**

Update `repositoryFacts(observation, previousRepository)` to emit:

```js
parent:
  observation.parent
    ? {
        id: observation.parent.id,
        owner: observation.parent.owner,
        name: observation.parent.name,
        url: observation.parent.url,
      }
    : observation.fork
      ? (previousRepository?.parent ?? null)
      : null,
```

Keep `parent` optional in schema-v2 snapshots for checked-in legacy
compatibility. `repositoryFacts()` must always emit `parent` for newly observed
snapshots. Document that it is the immediate parent, not the root source.

- [ ] **Step 7: Run the focused tests and schema validator**

Run:

```powershell
npm.cmd test -- --run tests/unit/github-observer.test.ts tests/unit/repository-snapshot.test.ts tests/unit/validate-catalog.test.ts
npm.cmd run catalog:validate
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add scripts/catalog/github-observer.mjs scripts/catalog/repository-snapshot.mjs data/schemas/repository-snapshot.schema.json docs/reference/repository-snapshot-schema.md tests/unit/github-observer.test.ts tests/unit/repository-snapshot.test.ts tests/unit/validate-catalog.test.ts
git commit -m "feat(catalog): observe fork parents"
```

---

### Task 2: Resolve safe public relationship data

**Files:**

- Create: `scripts/catalog/fork-relationship.mjs`
- Create: `tests/unit/fork-relationship.test.ts`
- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/catalog/catalog-types.ts`
- Test: `tests/unit/build-catalog.test.ts`
- Test: `tests/helpers/generated-catalog.ts`

**Interfaces:**

- Consumes:

```ts
interface ForkRelationshipResolutionInput {
  snapshot: RepositorySnapshot | null;
  recordsByRepositoryId: Map<number, ProjectRecord>;
  publicProjectIds: Set<string>;
}
```

- Produces:

```ts
export type CatalogForkRelationship = {
  parentName: string;
  parentProjectId: string | null;
  status: "published" | "not-listed" | "unavailable";
};

export function resolveForkRelationship(
  input: ForkRelationshipResolutionInput,
): CatalogForkRelationship | null;
```

- Browser-ready output never contains a parent repository ID, coordinate, or
  URL.

- [ ] **Step 1: Write failing resolver tests**

Cover these exact cases:

```ts
expect(resolveForkRelationship(publishedParent)).toEqual({
  parentName: "VectHare",
  parentProjectId: "coneja-chibi-vecthare",
  status: "published",
});

expect(resolveForkRelationship(disabledParent)).toEqual({
  parentName: "VectHare",
  parentProjectId: null,
  status: "not-listed",
});

expect(resolveForkRelationship(unknownParent)).toEqual({
  parentName: "VectHare",
  parentProjectId: null,
  status: "not-listed",
});
```

Also cover stale child snapshots (`unavailable`), repository rename resolution
by numeric ID, a non-fork, a fork with no observed parent, and a self-link.

- [ ] **Step 2: Run the resolver test and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/fork-relationship.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the isolated resolver**

Use the registry project name for any known record. Use the observed repository
name only when no registry record exists. Return a public project ID only when
the matched record is published and present in the generated public project
set.

- [ ] **Step 4: Add failing build and type assertions**

Update fixtures with `fork: null` and assert:

- published parent resolution;
- a disabled parent has no URL or public project ID;
- an unknown parent has name-only provenance;
- generated JSON contains no private parent coordinate;
- existing non-forks emit `fork: null`.

- [ ] **Step 5: Run build tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/build-catalog.test.ts tests/unit/fork-relationship.test.ts
```

Expected: FAIL because `CatalogProject.fork` and the build second pass do not
exist.

- [ ] **Step 6: Attach relationships in a catalog second pass**

Build base projects first, establish `publicProjectIds`, then map the projects
once to attach:

```js
fork: resolveForkRelationship({
  snapshot: snapshotsByProject.get(project.id) ?? null,
  recordsByRepositoryId,
  publicProjectIds,
}),
```

Do not resolve by mutable `owner/name`. Reject duplicate non-null registry
repository IDs during validation instead of selecting an arbitrary record.

- [ ] **Step 7: Run focused tests, catalog build, and typecheck**

Run:

```powershell
npm.cmd test -- --run tests/unit/fork-relationship.test.ts tests/unit/build-catalog.test.ts
npm.cmd run catalog:build
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add scripts/catalog/fork-relationship.mjs scripts/catalog/build.mjs src/features/catalog/catalog-types.ts tests/unit/fork-relationship.test.ts tests/unit/build-catalog.test.ts tests/helpers/generated-catalog.ts src/generated/catalog.json
git commit -m "feat(catalog): resolve fork relationships"
```

---

### Task 3: Classify upstream dependencies during submission triage

**Files:**

- Create: `scripts/submissions/fork-dependency.mjs`
- Create: `scripts/submissions/fork-dependency.d.mts`
- Create: `tests/unit/fork-dependency.test.ts`
- Modify: `scripts/submissions/triage-issue.mjs`
- Modify: `scripts/submissions/admission.mjs`
- Test: `tests/unit/project-submission-admission.test.ts`
- Test: `tests/unit/triage-issue.test.ts`

**Interfaces:**

- Extend GitHub source inspection:

```ts
interface SubmissionRepositoryParent {
  repositoryId: number;
  name: string;
  repository: string;
  canonicalUrl: string;
}

interface SubmissionRepositoryObservation {
  visibility: "public" | "private";
  archived: boolean;
  fork: boolean;
  parent: SubmissionRepositoryParent | null;
}
```

- Add:

```ts
interface ForkDependency {
  repositoryId: number;
  name: string;
  repository: string;
  canonicalUrl: string;
  issueNumber: number | null;
}

interface SubmissionLookup {
  issueNumber: number;
  state: "open" | "merged" | "declined";
}

type ForkDependencyDecision =
  | { status: "none" }
  | { status: "published"; parentProjectId: string }
  | { status: "not-listed"; dependency: ForkDependency }
  | { status: "waiting"; dependency: ForkDependency };

export function classifyForkDependency(input: {
  repository: SubmissionRepositoryObservation | undefined;
  projects: ProjectRecord[];
  priorSubmission: SubmissionLookup | null;
  ancestryRepositoryIds: number[];
}): ForkDependencyDecision;
```

- [ ] **Step 1: Add failing source-inspection tests**

Mock `/repos/owner/child` with:

```ts
{
  id: 42,
  fork: true,
  parent: {
    id: 41,
    name: "parent",
    full_name: "owner/parent",
    html_url: "https://github.com/owner/parent"
  }
}
```

Assert strict normalized output. Cover non-forks, missing parent metadata,
private parent metadata, and malformed parent identity.

- [ ] **Step 2: Add failing classification tests**

Assert:

- a published parent returns `published`;
- a `visibility: "disabled"` or `quarantined` parent returns `not-listed`;
- an unknown public parent returns `waiting`;
- a previously declined upstream issue returns `not-listed`;
- an open upstream issue returns `waiting` with its issue number;
- a merged upstream issue that is not visible in the checked-out registry
  remains `waiting` for the main-branch registry update;
- numeric repository ID is authoritative across renames.
- a repeated ancestor ID stops with maintainer attention instead of creating a
  cycle;
- an ancestry list of 16 IDs stops before creating a seventeenth hop.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/fork-dependency.test.ts tests/unit/triage-issue.test.ts tests/unit/project-submission-admission.test.ts
```

Expected: FAIL because parent inspection and classification do not exist.

- [ ] **Step 4: Implement inspection and pure classification**

Extend `inspectProjectSubmissionSource()` to retain only validated REST fork
metadata. Extend `projectSubmissionExistingProject()` to include
`visibility`, `kind`, and stable repository ID for classification.

Do not make API mutations from the pure classifier.

- [ ] **Step 5: Extend the stable triage marker**

Keep marker schema version 1 backward compatible and add optional:

```json
{
  "source_repository_id": 42,
  "fork_dependency": {
    "repository_id": 41,
    "name": "parent",
    "repository": "owner/parent",
    "canonical_url": "https://github.com/owner/parent",
    "issue_number": 201
  }
}
```

Validate every field strictly. Add `waiting-on-fork-parent` to
`submissionQueueLabels` and `triageLabels`.

- [ ] **Step 6: Add the waiting decision and copy**

The child issue remains open with:

```text
Parent is the immediate upstream of this fork and must complete Tavernary
review first. This submission will resume automatically after that review.
```

It receives `waiting-on-fork-parent`, not `needs-maintainer-review`, and does
not dispatch child PR generation.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npm.cmd test -- --run tests/unit/fork-dependency.test.ts tests/unit/triage-issue.test.ts tests/unit/project-submission-admission.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add scripts/submissions/fork-dependency.mjs scripts/submissions/fork-dependency.d.mts scripts/submissions/triage-issue.mjs scripts/submissions/admission.mjs tests/unit/fork-dependency.test.ts tests/unit/triage-issue.test.ts tests/unit/project-submission-admission.test.ts
git commit -m "feat(submissions): detect fork dependencies"
```

---

### Task 4: Create or reuse ordinary upstream submission issues

**Files:**

- Modify: `scripts/submissions/fork-dependency.mjs`
- Modify: `scripts/submissions/fork-dependency.d.mts`
- Modify: `scripts/submissions/triage-issue.mjs`
- Modify: `.github/workflows/triage-submission.yml`
- Test: `tests/unit/fork-dependency.test.ts`
- Test: `tests/unit/triage-issue.test.ts`
- Test: `tests/unit/workflows.test.ts`

**Interfaces:**

- Produces:

```ts
interface EnsureForkParentSubmissionResult {
  issueNumber: number;
  state: "created" | "open" | "merged" | "declined";
  dispatchTriage: boolean;
}

export function renderForkParentIssue(input: {
  dependency: ForkDependency;
  dependentIssueNumber: number;
  manifest: ProjectSubmissionManifest;
  ancestryRepositoryIds: number[];
}): { title: string; body: string; labels: string[] };

export async function ensureForkParentSubmission(input: {
  repository: string;
  dependency: ForkDependency;
  dependentIssueNumber: number;
  manifest: ProjectSubmissionManifest;
  request: GithubRequest;
}): Promise<EnsureForkParentSubmissionResult>;
```

- System issue marker:

```html
<!-- tavernary-fork-upstream
{"schema_version":1,"repository_id":41,"dependent_issue_number":123,"ancestry_repository_ids":[42,41]}
-->
```

- [ ] **Step 1: Write failing issue-render tests**

Assert that the upstream issue:

- uses the parent URL;
- retains the child project kind;
- carries the child frontend and Preset compatibility claims only as
  maintainer-review inputs;
- states that it was automatically discovered from the dependent issue;
- has `issue-admitted` and `project-submission`;
- contains a stable numeric repository marker;
- contains the complete ordered ancestry repository-ID list;
- requests no new user input.

- [ ] **Step 2: Write failing reuse/create tests**

Cover:

- reuse by prior marker issue number;
- reuse by a validated repository-ID match from paginated project-submission
  issues and their stable state comments;
- closed merged and declined outcomes;
- one created issue followed by one explicit triage dispatch;
- malformed or mismatched issue/comment markers ignored;
- repeated execution returning the same issue.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/fork-dependency.test.ts tests/unit/triage-issue.test.ts tests/unit/workflows.test.ts
```

Expected: FAIL because creation/reuse and the waiting label workflow contract do
not exist.

- [ ] **Step 4: Implement system issue rendering**

Render a normal `### Project manifest` JSON fence understood by
`parseProjectSubmissionIssue()`. Copy classification fields from the child
manifest because a GitHub fork preserves project lineage, but state explicitly
that maintainers must correct any inherited metadata before merge.

For a user-created child, seed ancestry with its source repository ID. For a
system-created upstream issue, parse and validate
`ancestry_repository_ids`, append the next parent ID, reject repeats, and stop
before the list would exceed 16 entries.

- [ ] **Step 5: Serialize fork triage jobs**

Change `.github/workflows/triage-submission.yml` to:

```yaml
concurrency:
  group: triage-project-submissions
  cancel-in-progress: false
```

This makes scan-then-create deterministic across different children that
discover the same parent. Keep per-issue generation concurrency unchanged.

Do not depend on GitHub search indexing. Page through project-submission issues,
parse the system marker in generated upstream issue bodies, and otherwise read
the stable triage comment's `source_repository_id`. The serialized workflow
makes that authoritative scan safe before creation.

- [ ] **Step 6: Synchronize the child before dispatching the parent**

Order mutations:

1. create or reuse the upstream issue;
2. update the child's stable marker and waiting label;
3. verify the child issue did not change;
4. dispatch `triage-submission.yml` only for a newly created or retryable
   upstream issue.

The child output remains `admitted=false`.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npm.cmd test -- --run tests/unit/fork-dependency.test.ts tests/unit/triage-issue.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add scripts/submissions/fork-dependency.mjs scripts/submissions/fork-dependency.d.mts scripts/submissions/triage-issue.mjs .github/workflows/triage-submission.yml tests/unit/fork-dependency.test.ts tests/unit/triage-issue.test.ts tests/unit/workflows.test.ts
git commit -m "feat(submissions): queue upstream reviews"
```

---

### Task 5: Resume waiting children after terminal parent review

**Files:**

- Create: `scripts/submissions/retry-fork-dependencies.mjs`
- Create: `scripts/submissions/retry-fork-dependencies.d.mts`
- Create: `tests/unit/retry-fork-dependencies.test.ts`
- Create: `.github/workflows/retry-fork-dependencies.yml`
- Modify: `scripts/submissions/project-submission-lifecycle.mjs`
- Modify: `scripts/submissions/project-submission-lifecycle.d.mts`
- Modify: `.github/workflows/project-submission-lifecycle.yml`
- Test: `tests/unit/project-submission-lifecycle.test.ts`
- Test: `tests/unit/workflows.test.ts`

**Interfaces:**

- Produces:

```ts
export function hasTerminalForkDependency(input: {
  comments: GithubComment[];
  projectsByRepositoryId: Map<number, ProjectRecord>;
  closedUpstreamIssueNumber?: number;
}): boolean;

export async function retryForkDependencies(input: {
  repository: string;
  ref: string;
  projects: ProjectRecord[];
  closedUpstreamIssueNumber?: number;
  request: GithubRequest;
}): Promise<number[]>;
```

- Extend closure plan:

```ts
type SubmissionClosurePlan =
  | { action: "ignore" }
  | {
      action: "merged" | "decline";
      issueNumber: number;
      retryForkDependents: true;
      // existing fields
    };
```

- [ ] **Step 1: Write failing retry-selection tests**

Create waiting issues with structured fork markers and assert dispatch when:

- the parent repository ID is now published;
- the parent registry record is disabled or quarantined;
- the referenced upstream issue closed merged;
- the referenced upstream issue closed declined.

Assert no dispatch for unrelated parent IDs, still-open upstream review, closed
child issues, malformed markers, or repeated pages containing the same issue.

- [ ] **Step 2: Run retry tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/retry-fork-dependencies.test.ts
```

Expected: FAIL because the retry module does not exist.

- [ ] **Step 3: Implement targeted retry**

Follow the established `retry-frontend-dependencies.mjs` request-injection and
pagination pattern. Query only open issues labeled
`project-submission,waiting-on-fork-parent`. Dispatch ordinary
`triage-submission.yml`; never generate a child PR directly.

- [ ] **Step 4: Add failing lifecycle/workflow tests**

Assert the closed-PR workflow dispatches fork-dependent retry with the closed
upstream issue number after issue lifecycle synchronization. The upstream issue
itself retains existing merged/declined close behavior.

- [ ] **Step 5: Run lifecycle/workflow tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/project-submission-lifecycle.test.ts tests/unit/workflows.test.ts
```

Expected: FAIL because no retry dispatch exists.

- [ ] **Step 6: Implement workflow triggers**

Create `.github/workflows/retry-fork-dependencies.yml` with:

```yaml
on:
  push:
    branches: [main]
    paths:
      - "data/registry/projects/**"
  workflow_dispatch:
    inputs:
      upstream_issue_number:
        required: false
        type: number
```

Permissions are `contents: read`, `issues: read`, and `actions: write`.
Concurrency is one non-canceling global retry group.

After a generated PR closes, dispatch this workflow with its issue number.
Registry pushes cover merged publication and later relisting/delisting.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npm.cmd test -- --run tests/unit/retry-fork-dependencies.test.ts tests/unit/project-submission-lifecycle.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add scripts/submissions/retry-fork-dependencies.mjs scripts/submissions/retry-fork-dependencies.d.mts tests/unit/retry-fork-dependencies.test.ts .github/workflows/retry-fork-dependencies.yml scripts/submissions/project-submission-lifecycle.mjs scripts/submissions/project-submission-lifecycle.d.mts .github/workflows/project-submission-lifecycle.yml tests/unit/project-submission-lifecycle.test.ts tests/unit/workflows.test.ts
git commit -m "feat(submissions): resume fork dependents"
```

---

### Task 6: Add bounded existing-catalog backfill

**Files:**

- Create: `scripts/submissions/backfill-fork-dependencies.mjs`
- Create: `scripts/submissions/backfill-fork-dependencies.d.mts`
- Create: `tests/unit/backfill-fork-dependencies.test.ts`
- Modify: `package.json`

**Interfaces:**

- Produces:

```ts
interface ForkBackfillCandidate {
  parentRepositoryId: number;
  parentName: string;
  parentRepository: string;
  dependentProjectIds: string[];
  manifest: ProjectSubmissionManifest;
}

interface BackfillReport {
  mode: "dry-run" | "apply";
  candidates: ForkBackfillCandidate[];
  createdIssueNumbers: number[];
  reusedIssueNumbers: number[];
  terminalIssueNumbers: number[];
  updatedSnapshotPaths: string[];
}

export function planForkDependencyBackfill(input: {
  projects: ProjectRecord[];
  snapshots: RepositorySnapshot[];
}): ForkBackfillCandidate[];

export async function observeForkBackfillParents(input: {
  projects: ProjectRecord[];
  snapshots: RepositorySnapshot[];
  token: string;
}): Promise<{
  candidates: ForkBackfillCandidate[];
  updatedSnapshots: RepositorySnapshot[];
}>;

export async function applyForkDependencyBackfill(input: {
  candidates: ForkBackfillCandidate[];
  repository: string;
  request: GithubRequest;
  apply: boolean;
}): Promise<BackfillReport>;
```

- CLI:

```text
npm run submissions:backfill-forks
npm run submissions:backfill-forks -- --apply
```

Dry-run is the default. Both modes require GitHub authentication because legacy
snapshots may not yet contain a parent observation; only apply mode writes
snapshots or creates issues.

- [ ] **Step 1: Write failing backfill-planning tests**

Assert:

- only published automatic GitHub children with `repository.fork: true` and an
  observed parent are considered;
- parents already present in any registry visibility are skipped;
- the same missing parent is deduplicated by numeric ID;
- legacy fork snapshots without `parent` are re-observed through the existing
  batched GraphQL observer;
- fork counts are never enumerated;
- incompatible child kinds for the same parent fail closed;
- candidates are sorted by parent repository ID for deterministic review.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/backfill-fork-dependencies.test.ts
```

Expected: FAIL because the backfill module does not exist.

- [ ] **Step 3: Implement dry-run planning**

Select checked-in snapshots whose repository is a fork, then use
`observeRepositories()` to refresh those known repositories in bounded
batches. Merge the returned repository/community/release facts through the
existing snapshot helpers while preserving activity, license, contributors,
and scans. Reuse `renderForkParentIssue()` and
`ensureForkParentSubmission()`; do not duplicate issue rendering or identity
matching.

- [ ] **Step 4: Add apply/idempotence tests**

Assert dry-run performs zero mutations, apply creates/reuses issues serially,
and a second apply reports only reused/terminal issues.

- [ ] **Step 5: Implement apply mode and package script**

Add:

```json
"submissions:backfill-forks": "node scripts/submissions/backfill-fork-dependencies.mjs"
```

Require `GITHUB_TOKEN` for both modes and `GITHUB_REPOSITORY` for `--apply`.
Dry-run prints proposed snapshot paths and issues but performs no writes. Apply
writes the safely refreshed snapshots, creates/reuses upstream issues
serially, and prints a JSON report with candidate IDs, updated snapshot paths,
created issue numbers, reused issue numbers, and terminal skips.

- [ ] **Step 6: Run focused tests and a local dry run**

Run:

```powershell
npm.cmd test -- --run tests/unit/backfill-fork-dependencies.test.ts
$env:GITHUB_TOKEN = gh auth token
npm.cmd run submissions:backfill-forks
Remove-Item Env:GITHUB_TOKEN
```

Expected: tests PASS; dry run lists candidates and performs no GitHub mutation.

- [ ] **Step 7: Commit**

```powershell
git add scripts/submissions/backfill-fork-dependencies.mjs scripts/submissions/backfill-fork-dependencies.d.mts tests/unit/backfill-fork-dependencies.test.ts package.json
git commit -m "feat(submissions): plan fork backfill"
```

---

### Task 7: Add the relationship query and fixed pair selector

**Files:**

- Modify: `src/features/catalog/catalog-query.ts`
- Modify: `src/features/catalog/catalog-selectors.ts`
- Modify: `src/features/catalog/use-catalog-query.ts`
- Test: `tests/unit/catalog-selectors.test.ts`
- Create: `tests/unit/use-catalog-query.test.tsx`

**Interfaces:**

- Extend:

```ts
interface CatalogQuery {
  // existing fields
  relationship: string;
}
```

- Add:

```ts
export function selectForkRelationship(
  projects: CatalogProject[],
  childProjectId: string,
): [parent: CatalogProject, child: CatalogProject] | null;

export interface CatalogQueryHistory {
  setQuery(
    next: CatalogQuery | ((current: CatalogQuery) => CatalogQuery),
  ): void;
  pushQuery(
    next: CatalogQuery | ((current: CatalogQuery) => CatalogQuery),
  ): void;
  removeRelationship(): void;
}
```

- URL key: `relationship=<child-project-id>`.

- [ ] **Step 1: Add failing query round-trip tests**

Assert:

```ts
serializeCatalogQuery({
  ...DEFAULT_QUERY,
  search: "memory",
  frontends: ["sillytavern"],
  relationship: "vectfox",
});
```

preserves all three parameters, invalid blank/unsafe IDs normalize to `""`, and
Kit mode discards relationship scope.

- [ ] **Step 2: Add failing pair-selector tests**

Assert:

- pair order is `[parent, child]` regardless of sort;
- ordinary filters and search do not affect a valid pair;
- missing child, non-published relationship, missing parent, and self-link
  return `null`;
- a parent that is itself a fork remains a normal project capable of another
  lookup.

- [ ] **Step 3: Run selector tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/catalog-selectors.test.ts tests/unit/use-catalog-query.test.tsx
```

Expected: FAIL because relationship query and selection do not exist.

- [ ] **Step 4: Implement parsing, serialization, and selection**

Validate project IDs with:

```ts
const projectIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
```

Keep `selectProjects()` unchanged for ordinary results. The page chooses
`selectForkRelationship()` first when `query.relationship` is non-empty.

- [ ] **Step 5: Add failing history tests**

Test that `pushQuery()` uses `history.pushState` with a relationship-origin
marker, `removeRelationship()` navigates back for locally pushed relationship
entries, and a directly loaded URL removes only the relationship parameter via
`replaceState`.

- [ ] **Step 6: Implement query history helpers**

Use:

```ts
type TavernaryHistoryState = {
  tavernaryRelationshipOrigin?: boolean;
};
```

`Clear all` must use normal replacement with `DEFAULT_QUERY`, not history back.

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```powershell
npm.cmd test -- --run tests/unit/catalog-selectors.test.ts tests/unit/use-catalog-query.test.tsx
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/features/catalog/catalog-query.ts src/features/catalog/catalog-selectors.ts src/features/catalog/use-catalog-query.ts tests/unit/catalog-selectors.test.ts tests/unit/use-catalog-query.test.tsx
git commit -m "feat(catalog): add relationship query"
```

---

### Task 8: Render the relationship control without nested interaction

**Files:**

- Create: `src/features/catalog/components/project-relationship-control.tsx`
- Modify: `src/features/catalog/components/project-grid.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/styles/catalog.css`
- Test: `tests/unit/project-card.test.tsx`
- Test: `tests/unit/visual-alignment-contract.test.ts`

**Interfaces:**

- Produces:

```ts
interface ProjectRelationshipControlProps {
  childProjectName: string;
  relationship: CatalogForkRelationship;
  active: boolean;
  onViewRelationship: (() => void) | null;
}
```

- Extend `ProjectGrid`:

```ts
interface ProjectGridProps {
  // existing fields
  relationshipChildId: string;
  onViewRelationship(childProjectId: string): void;
}
```

- [ ] **Step 1: Write failing rendered-card tests**

Assert ordinary published child renders:

```text
Fork of VectHare · View relationship
```

Assert not-listed renders:

```text
Fork of VectHare · Upstream not listed
```

The latter has no link/button and no GitHub URL. In an active pair, the selected
child renders static provenance without a redundant action; a forked parent
still renders its own upward action.

- [ ] **Step 2: Assert valid interactive markup**

Verify the repository card remains the existing external anchor and the
relationship button is a sibling inside `.project-card-shell`, never nested
inside that anchor. Clicking the relationship button must not open the
repository.

- [ ] **Step 3: Run component tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/project-card.test.tsx
```

Expected: FAIL because the relationship control does not exist.

- [ ] **Step 4: Implement the sibling control**

Follow the existing `ProjectKitControl` seam. Reserve card space with a shell
class and position the sibling relationship row over that reserved surface.
Pass text through React nodes only; never use raw HTML.

- [ ] **Step 5: Add failing CSS contract tests**

Require:

- `.relationship-pair` has exactly two equal columns and bounded width;
- the narrow breakpoint uses one column;
- DOM order remains unchanged;
- the relationship row remains readable in standard and compact density;
- existing Kit control hit targets do not overlap the relationship action.

- [ ] **Step 6: Implement pair and control styling**

Use existing palette tokens. Do not add a banner, arrow between cards, card
badge, or special parent/child heading.

- [ ] **Step 7: Run focused tests and audits**

Run:

```powershell
npm.cmd test -- --run tests/unit/project-card.test.tsx tests/unit/visual-alignment-contract.test.ts
npm.cmd run palette:audit
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/features/catalog/components/project-relationship-control.tsx src/features/catalog/components/project-grid.tsx src/features/catalog/components/project-card.tsx src/features/catalog/components/catalog-page.tsx src/styles/catalog.css tests/unit/project-card.test.tsx tests/unit/visual-alignment-contract.test.ts
git commit -m "feat(catalog): render fork relationships"
```

---

### Task 9: Integrate the removable relationship token and clear semantics

**Files:**

- Modify: `src/features/catalog/components/active-query.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Test: `tests/unit/catalog-license-filter-contract.test.tsx`
- Test: `tests/e2e/catalog.spec.ts`

**Interfaces:**

- `ActiveQuery` receives:

```ts
relationship:
  | {
      childId: string;
      childName: string;
      parentName: string;
    }
  | null;
onRemoveRelationship(): void;
```

- [ ] **Step 1: Write failing active-query tests**

When relationship scope is valid, assert the active area contains only:

```text
Fork: VectHare → VectFox
```

Its removal accessible name must say:

```text
Remove fork relationship between VectHare and VectFox
```

Preserved ordinary filter tokens are not displayed while suspended.

- [ ] **Step 2: Write failing E2E flow**

Add a deterministic fixture parent and child. Test:

1. activate search and frontend filters;
2. click the child's `View relationship`;
3. see exactly parent then child;
4. see the relationship token;
5. remove only the token and recover the previous filters/results;
6. activate it again;
7. click `Clear all` and recover the default catalog with no filters;
8. repeat with the filter panel's `Clear filters`;
9. navigate from a forked parent to its parent and use browser Back;
10. verify mobile order is parent then child.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/catalog-license-filter-contract.test.tsx
npm.cmd run test:e2e -- --grep "fork relationship"
```

Expected: FAIL because the token and page wiring do not exist.

- [ ] **Step 4: Implement page integration**

Derive the pair once:

```ts
const relationshipProjects = useMemo(
  () => selectForkRelationship(catalog.projects, query.relationship),
  [catalog.projects, query.relationship],
);
```

Normalize an invalid relationship by removing only that parameter. While valid,
use the fixed pair as `selectedProjects`, increment `filterCount` by one, and
pass `relationshipChildId` to the grid.

- [ ] **Step 5: Implement removal and clear semantics**

- Relationship token `×`: `removeRelationship()`.
- Browser Back: native `popstate`.
- Page `Clear all`: reset to the existing default while retaining only the
  current sort/density policy already used by the page.
- Filter panel `Clear filters`: call the same page handler.
- Direct/shared stale relationship: normalize to ordinary preserved query.

- [ ] **Step 6: Run unit and E2E tests**

Run:

```powershell
npm.cmd test -- --run tests/unit/catalog-license-filter-contract.test.tsx tests/unit/catalog-selectors.test.ts tests/unit/project-card.test.tsx
npm.cmd run test:e2e -- --grep "fork relationship"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/features/catalog/components/active-query.tsx src/features/catalog/components/catalog-page.tsx tests/unit/catalog-license-filter-contract.test.tsx tests/e2e/catalog.spec.ts
git commit -m "feat(catalog): focus fork relationships"
```

---

### Task 10: Add visual proof and stale-delisting coverage

**Files:**

- Modify: `tests/fixtures/visual-catalog.json`
- Modify: `tests/visual/catalog.visual.spec.ts`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/unit/build-catalog.test.ts`

**Interfaces:**

- Consumes: the final generated `CatalogProject.fork` contract and relationship
  URL query.
- Produces: desktop standard, desktop compact, and mobile relationship
  screenshots with parent-first order.

- [ ] **Step 1: Add failing stale/delisted E2E coverage**

Use a fixture whose child points at a non-published parent. Assert there is no
`View relationship`, no parent URL, and a manually entered stale relationship
query normalizes away without rendering the removed parent.

- [ ] **Step 2: Run the focused E2E test and verify RED**

Run:

```powershell
npm.cmd run test:e2e -- --grep "delisted fork parent"
```

Expected: FAIL until stale normalization and fixture data are complete.

- [ ] **Step 3: Add relationship visual scenarios**

Capture:

- standard desktop two-column pair;
- compact desktop two-column pair;
- mobile parent-then-child stack;
- long parent and child names without token/control collision.

- [ ] **Step 4: Generate and inspect visual baselines**

Run:

```powershell
npm.cmd run test:visual -- --grep "fork relationship" --update-snapshots
```

Inspect each changed PNG. Confirm no third-column gap, overlapping Kit control,
truncated clear target, banner, or accidental child listing.

- [ ] **Step 5: Run visual and E2E verification**

Run:

```powershell
npm.cmd run test:visual -- --grep "fork relationship"
npm.cmd run test:e2e -- --grep "fork relationship|delisted fork parent"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add tests/fixtures/visual-catalog.json tests/visual/catalog.visual.spec.ts tests/e2e/catalog.spec.ts tests/unit/build-catalog.test.ts tests/visual
git commit -m "test(catalog): prove fork relationship UI"
```

---

### Task 11: Document operations, run full gates, and stage the controlled backfill

**Files:**

- Modify: `docs/architecture/catalog-lifecycle.md`
- Modify: `docs/contributing/submission-and-review.md`
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: exact `data/snapshots/github/*.json` paths listed by the approved
  backfill report
- Modify: `src/generated/catalog.json` only through `npm.cmd run catalog:build`

**Interfaces:**

- Operations document the labels:
  `waiting-on-fork-parent`, `needs-maintainer-review`, and
  `submission-pr-open`.
- Backfill remains dry-run until explicit operator approval.

- [ ] **Step 1: Update architecture and contributor documentation**

Document:

- snapshot parent facts versus public relationship data;
- immediate-parent-only behavior;
- system-created upstream issue provenance;
- root-to-leaf review and retry;
- delisting name-only behavior;
- no child/family discovery;
- clear-token versus clear-all behavior.

- [ ] **Step 2: Update the operations runbook**

Add exact recovery instructions for:

- a waiting child whose upstream issue is open;
- a declined upstream;
- a retry workflow failure;
- a duplicate system upstream issue;
- a 16-hop/cycle maintainer-attention stop;
- dry-run and apply backfill commands.

- [ ] **Step 3: Run the complete local verification gate**

Run:

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
```

Expected: format, lint, palette, schema, catalog build, typecheck, all unit
tests, production build, static export, E2E, and visual suites PASS.

- [ ] **Step 4: Run a read-only GitHub and backfill preflight**

Run:

```powershell
gh auth status
gh repo view --json nameWithOwner,url,defaultBranchRef
$env:GITHUB_TOKEN = gh auth token
npm.cmd run submissions:backfill-forks
Remove-Item Env:GITHUB_TOKEN
```

Expected: authenticated Tavernary repository and a deterministic dry-run report
with no mutations.

- [ ] **Step 5: Stop for operator approval before external backfill**

Present:

- every proposed upstream repository ID and name;
- dependent existing project IDs;
- whether an open, merged, declined, or disabled decision already exists;
- the number of new GitHub issues that `--apply` would create.

Do not run `--apply` without explicit approval.

- [ ] **Step 6: Apply and verify the backfill after approval**

In PowerShell:

```powershell
$env:GITHUB_REPOSITORY = "MentallyQuill/Tavernary"
$env:GITHUB_TOKEN = gh auth token
npm.cmd run submissions:backfill-forks -- --apply
Remove-Item Env:GITHUB_TOKEN
```

Then inspect created issues with:

```powershell
gh issue list --label project-submission --state all --limit 100
gh run list --workflow triage-submission.yml --limit 20
```

Expected: one upstream issue per unique missing repository ID, no duplicate
active submissions, and root-most missing ancestors entering review first.

- [ ] **Step 7: Commit documentation or refreshed generated evidence**

```powershell
git add docs/architecture/catalog-lifecycle.md docs/contributing/submission-and-review.md docs/maintenance/operations-runbook.md src/generated/catalog.json
git commit -m "docs(catalog): explain fork relationships"
```

Stage each approved `updated_snapshot_paths` entry from the backfill report with
an explicit `git add -- <path>` before this commit. Do not stage the entire
snapshot directory. Skip the commit if the full diff is empty.

- [ ] **Step 8: Final repository verification**

Run:

```powershell
git status --short
git log -12 --oneline
```

Expected: no uncommitted feature changes and a reviewable sequence of focused
commits.
