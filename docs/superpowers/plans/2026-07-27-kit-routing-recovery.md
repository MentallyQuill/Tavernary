# Kit Routing Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-heal missing submission routing labels, reconcile every historical Kit issue, publish issue #109, and prove the Kit is visible on the live site.

**Architecture:** Keep explicit routing labels authoritative, but let the admission script recover one missing route from an exact structured issue-form shape and add that label before emitting workflow outputs. Add a pure, network-free historical classifier that compares Kit issue manifests with canonical Kit records; use its ledger to perform live mutations through the GitHub CLI and continue unpublished Kits through the existing validation/publication workflows.

**Tech Stack:** Node.js 24 ESM, TypeScript declaration files, Vitest, GitHub Actions YAML, GitHub CLI, Next.js static export, GitHub Pages.

## Global Constraints

- Preserve label-driven routing when one or more explicit routing labels exist.
- Never infer routing from an issue title.
- Recover only a complete, unambiguous issue-form shape.
- More than one explicit or inferred route fails closed.
- Publication must continue through `triage-kit-submission.yml` and `apply-kit-submission.yml`; never write historical Kit registry records manually.
- Preserve unrelated issue labels during reconciliation.
- Reconciliation must be idempotent and must not reopen terminal superseded submissions.
- Preserve the unrelated untracked `docs/superpowers/plans/2026-07-27-project-submission-pr-url-rendering.md`.
- Use `npm.cmd` on Windows.
- Use the GitHub CLI for every live GitHub read or mutation.

## File Structure

- Modify `scripts/submissions/admit-issue.mjs`: define owned routing labels, recognize exact form shapes, restore a recovered route label, and return the effective route.
- Modify `scripts/submissions/admit-issue.d.mts`: expose the form-routing and enriched admission-decision contracts.
- Modify `tests/unit/admit-issue.test.ts`: cover exact-body inference, ambiguity, label provisioning, same-run dispatch output, and edited-issue recovery.
- Create `scripts/submissions/kit-submission-reconciliation.mjs`: pure historical classification and desired-label calculation.
- Create `scripts/submissions/kit-submission-reconciliation.d.mts`: typed reconciliation inputs and outputs.
- Create `tests/unit/kit-submission-reconciliation.test.ts`: reproduce the eight historical dispositions and idempotent label synchronization.
- Modify `package.json`: expose dry-run and apply reconciliation commands.
- Modify `tests/unit/workflows.test.ts`: retain the explicit no-title-routing and worker-dispatch boundaries.

---

### Task 0: Create an Isolated Implementation Worktree

**Files:**
- Create worktree: `F:\git\Tavernary\.worktrees\kit-routing-recovery`
- Create branch: `codex/fix-kit-routing-recovery`

**Interfaces:**
- Consumes: approved design and this plan from local `main`
- Produces: isolated branch used by Tasks 1-7

- [ ] **Step 1: Verify worktree placement is ignored**

```powershell
git check-ignore -q .worktrees
```

Expected: exit 0. If it is not ignored, add `.worktrees/` to `.gitignore`,
commit that focused change, and rerun the check before creating the worktree.

- [ ] **Step 2: Create the isolated branch and worktree**

```powershell
git worktree add 'F:\git\Tavernary\.worktrees\kit-routing-recovery' -b codex/fix-kit-routing-recovery HEAD
```

Expected: the new worktree is on `codex/fix-kit-routing-recovery`.

- [ ] **Step 3: Verify isolation**

Run inside the new worktree:

```powershell
git branch --show-current
git status --short
```

Expected: branch `codex/fix-kit-routing-recovery` and a clean status. The
unrelated untracked Project-submission plan remains only in the original
checkout.

---

### Task 1: Recover Routes from Exact Structured Forms

**Files:**
- Modify: `tests/unit/admit-issue.test.ts`
- Modify: `scripts/submissions/admit-issue.mjs`
- Modify: `scripts/submissions/admit-issue.d.mts`

**Interfaces:**
- Produces: `issueRouteFromBody(body?: string): IssueRoute`
- Produces: `effectiveIssueRoute(issue: { title?: string; body?: string; labels?: Array<string | { name: string }> }): IssueRoute`
- Consumes: existing `issueRouteFromLabels(labels): IssueRoute`

- [ ] **Step 1: Write the failing complete-Kit-form test**

Add a body fixture and assertion:

```ts
const kitBody = [
  "### Kit title",
  "",
  "Super Awesome Test Kit",
  "",
  "### Kit description",
  "",
  "Testing.",
  "",
  "### Kit manifest",
  "",
  "```json",
  '{"operation":"create","kit_id":null,"title":"Super Awesome Test Kit","description":"Testing.","project_ids":["sillytavern-sillytavern"]}',
  "```",
].join("\n");

test("recovers an unlabeled Kit route from the complete structured form", () => {
  expect(issueRouteFromBody(kitBody)).toBe("kit");
  expect(effectiveIssueRoute({ body: kitBody, labels: [] })).toBe("kit");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts
```

Expected: FAIL because `issueRouteFromBody` and `effectiveIssueRoute` are not exported.

- [ ] **Step 3: Implement exact heading-set recognition**

In `admit-issue.mjs`, parse headings with:

```js
function issueHeadings(body = "") {
  return new Set(
    String(body)
      .split(/^### /m)
      .slice(1)
      .map((section) => section.split(/\r?\n/, 1)[0]?.trim())
      .filter(Boolean),
  );
}
```

Initially recognize only the complete Kit shape:

```js
const kitFormHeadings = ["Kit title", "Kit description", "Kit manifest"];
```

Return `kit` only when every Kit heading exists and `none` otherwise.
`effectiveIssueRoute` returns any explicit label result other than `none`;
only `none` may fall back to the structured body.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts
```

Expected: all admission tests pass.

- [ ] **Step 5: Add the next failing ambiguity and precedence tests**

Add tests proving:

```ts
test("does not route a partial Kit form", () => {
  expect(issueRouteFromBody("### Kit title\n\nIncomplete")).toBe("none");
});

test("keeps explicit routing labels authoritative", () => {
  expect(
    effectiveIssueRoute({
      body: kitBody,
      labels: ["project-submission"],
    }),
  ).toBe("project");
});

test("fails closed when complete form shapes conflict", () => {
  expect(
    issueRouteFromBody(
      `${kitBody}\n\n### Kit ID\n\nkit-1\n\n### Kit share URL\n\nhttps://example.test\n\n### Confirmation\n\n- [x] Confirm`,
    ),
  ).toBe("conflict");
});

test("never infers a route from the issue title", () => {
  expect(
    effectiveIssueRoute({
      title: "[Kit submission]: title only",
      body: "ordinary issue body",
      labels: [],
    }),
  ).toBe("none");
});
```

- [ ] **Step 6: Run the test and verify RED, then implement only the missing edge behavior**

Run:

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts
```

Expected before the edge implementation: the combined-form ambiguity and the
other complete form routes fail. Expand recognition to all exact shapes:

```js
const formRoutes = [
  {
    route: "project",
    headings: ["Project Type", "Project URL", "Frontend-independent"],
  },
  {
    route: "kit",
    headings: ["Kit title", "Kit description", "Kit manifest"],
  },
  {
    route: "kit-withdrawal",
    headings: ["Kit ID", "Kit share URL", "Confirmation"],
  },
];
```

Return `conflict` if multiple complete shapes match, the single route if one
matches, and `none` otherwise. Never inspect `issue.title`. Rerun and expect
PASS.

- [ ] **Step 7: Update declarations**

Add the two exported function signatures and add optional `body` and `title`
fields to `AdmissionEvent.issue` in `admit-issue.d.mts`.

- [ ] **Step 8: Commit Task 1**

```powershell
git add -- scripts/submissions/admit-issue.mjs scripts/submissions/admit-issue.d.mts tests/unit/admit-issue.test.ts
git commit -m "fix(submissions): recover structured routes"
```

---

### Task 2: Provision and Restore Routing Labels During Admission

**Files:**
- Modify: `tests/unit/admit-issue.test.ts`
- Modify: `scripts/submissions/admit-issue.mjs`
- Modify: `scripts/submissions/admit-issue.d.mts`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**
- Consumes: `effectiveIssueRoute(issue): IssueRoute` from Task 1
- Produces: `AdmissionResult`, an admission decision extended with `route: IssueRoute`
- Produces: same-run workflow outputs through `issueAdmissionOutputs(decision, event)`

- [ ] **Step 1: Write the failing route-label provisioning test**

Extend the admission request harness so GitHub label creation calls are visible,
then assert that an admitted unlabeled Kit form creates/ensures
`project-submission`, `kit-submission`, and `kit-withdrawal`, adds only
`kit-submission` to the issue, and resolves with `route: "kit"`.

```ts
test("restores a missing Kit route label during admission", async () => {
  const request = vi.fn(async (path: string) => {
    if (path.includes("?state=open")) return openIssues(1);
    return null;
  });
  const baseEvent = event(109, "COLLABORATOR");
  const kitEvent = {
    ...baseEvent,
    issue: { ...baseEvent.issue, body: kitBody },
  };

  await expect(
    processIssueAdmission({ event: kitEvent, request }),
  ).resolves.toMatchObject({ admitted: true, route: "kit" });

  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/109/labels",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ labels: ["kit-submission"] }),
    }),
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts
```

Expected: FAIL because the returned decision has no `route` and no routing
label is restored.

- [ ] **Step 3: Implement routing-label ownership and same-run recovery**

Expand the owned label definitions:

```js
const routingLabels = {
  "project-submission": {
    color: "1d76db",
    description: "Structured project submission awaiting Tavernary processing.",
  },
  "kit-submission": {
    color: "1d76db",
    description: "Structured Kit submission awaiting Tavernary processing.",
  },
  "kit-withdrawal": {
    color: "6e7781",
    description: "Structured Kit withdrawal awaiting Tavernary processing.",
  },
};
```

Ensure admission and routing label definitions before synchronization. After
admission succeeds, calculate `effectiveIssueRoute(currentIssue)`. If it is one
non-conflicting recovered route and the issue lacks its label, add that label.
Return `{ ...decision, route }`.

For `edited` events, preserve the existing admission decision but do not return
before label provisioning and route recovery. Closed or unadmitted edits return
`route: "none"` and perform no issue-label restoration.

Change `issueAdmissionOutputs` to use `decision.route` and fall back to
`effectiveIssueRoute(event.issue)` only for direct unit callers.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add and run the admitted-edit recovery test**

Add a test with `action: "edited"`, labels containing only `issue-admitted`,
and `body: kitBody`. Verify one `kit-submission` add call and result route
`kit`. Run the focused tests; verify RED before adjusting edited-event control
flow and GREEN afterward.

- [ ] **Step 6: Verify workflow invariants**

Keep these assertions in `tests/unit/workflows.test.ts`:

```ts
expect(source).not.toContain("startsWith(github.event.issue.title");
expect(source).toContain("steps.admission.outputs.route == 'kit'");
expect(source).toContain("gh workflow run triage-kit-submission.yml");
```

Run:

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- scripts/submissions/admit-issue.mjs scripts/submissions/admit-issue.d.mts tests/unit/admit-issue.test.ts tests/unit/workflows.test.ts
git commit -m "fix(submissions): restore routing labels"
```

---

### Task 3: Classify Historical Kit Submission State

**Files:**
- Create: `scripts/submissions/kit-submission-reconciliation.mjs`
- Create: `scripts/submissions/kit-submission-reconciliation.d.mts`
- Create: `tests/unit/kit-submission-reconciliation.test.ts`

**Interfaces:**
- Consumes: `parseKitIssueFields(body)` from `triage-kit-issue.mjs`
- Consumes: `validateKitSubmission(input)` from `validate-kit-submission.mjs`
- Produces:

```ts
type KitHistoryDisposition =
  | "published-create"
  | "applied-edit"
  | "superseded"
  | "unpublished-valid"
  | "invalid";

interface KitReconciliation {
  disposition: KitHistoryDisposition;
  desiredOwnedLabels: string[];
  desiredState: "open" | "closed";
  desiredStateReason: "completed" | "duplicate" | null;
  dispatch: boolean;
}

export function classifyKitSubmissionHistory(input: {
  issue: GitHubKitIssue;
  projects: ProjectRecord[];
  kits: CanonicalKit[];
  blockedUsers: BlockedUsers;
}): KitReconciliation;

export function reconcileOwnedKitLabels(input: {
  currentLabels: string[];
  desiredOwnedLabels: string[];
}): string[];

export function buildKitReconciliationLedger(input: {
  issues: GitHubKitIssue[];
  projects: ProjectRecord[];
  kits: CanonicalKit[];
  blockedUsers: BlockedUsers;
}): Array<KitReconciliation & {
  issueNumber: number;
  labels: string[];
}>;

export function runKitReconciliation(input: {
  repository: string;
  apply: boolean;
  gh: (args: string[], stdin?: string) => Promise<string>;
  projects: ProjectRecord[];
  kits: CanonicalKit[];
  blockedUsers: BlockedUsers;
}): Promise<Array<KitReconciliation & {
  issueNumber: number;
  labels: string[];
}>>;
```

- [ ] **Step 1: Write the failing published-create test**

Create fixtures matching issue #18 and canonical
`ultimate-harry-potter-18.json`. Expect:

```ts
expect(classifyKitSubmissionHistory(input)).toEqual({
  disposition: "published-create",
  desiredOwnedLabels: [
    "issue-admitted",
    "kit-submission",
    "kit-published",
  ],
  desiredState: "closed",
  desiredStateReason: "completed",
  dispatch: false,
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/kit-submission-reconciliation.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement published-create classification**

Parse the fenced manifest through `parseKitIssueFields`. A create is already
published only when a canonical Kit has
`source_issue_number === issue.number`, matching numeric author identity, and
`status === "published"`.

- [ ] **Step 4: Run the test and verify GREEN**

Run the new test file and expect PASS.

- [ ] **Step 5: Add the failing applied-edit test**

Use issue #20's edit manifest and a canonical Kit whose title, description,
ordered `project_ids`, and author match that manifest. Expect
`disposition: "applied-edit"`, `kit-published`, closed/completed, and
`dispatch: false`.

Run the test and verify RED because edit comparison is not implemented.

- [ ] **Step 6: Implement exact applied-edit comparison and verify GREEN**

An edit is applied only when:

```js
kit.id === manifest.kit_id &&
kit.status === "published" &&
kit.author.github_user_id === issue.user.id &&
kit.title === manifest.title.trim() &&
kit.description === manifest.description.trim() &&
JSON.stringify(kit.project_ids) === JSON.stringify(manifest.project_ids)
```

Run the focused test and expect PASS.

- [ ] **Step 7: Add the failing superseded and unpublished tests**

Add fixtures for:

- #16/#19: a create with the same normalized project set and author as a
  different published canonical Kit -> `superseded`, closed/duplicate,
  `dispatch: false`.
- #109: no matching/same-set canonical Kit and a valid current submission ->
  `unpublished-valid`, open, labels `issue-admitted` and `kit-submission`,
  `dispatch: true`.

Run the test and verify RED.

- [ ] **Step 8: Implement superseded and current validation paths**

For creates without a source-issue match, compare the sorted unique project ID
set and numeric author identity against published Kits before calling
`validateKitSubmission`. If superseded, return terminal duplicate state.
Otherwise validate with the issue actor, full project registry, canonical Kits,
blocked users, and `sourceIssueNumber: issue.number`. Valid results dispatch;
invalid results keep `dispatch: false`, preserve current open/closed state, and
use the validator's owned triage labels.

Run the focused test and expect PASS.

- [ ] **Step 9: Add the failing idempotent label merge test**

```ts
expect(
  reconcileOwnedKitLabels({
    currentLabels: [
      "documentation",
      "needs-maintainer-review",
      "kit-submission",
    ],
    desiredOwnedLabels: ["issue-admitted", "kit-submission", "kit-published"],
  }),
).toEqual([
  "documentation",
  "issue-admitted",
  "kit-submission",
  "kit-published",
]);
```

Run once to verify RED. Implement a stable merge that removes only these owned
labels:

```js
[
  "issue-admitted",
  "kit-submission",
  "kit-published",
  "kit-publication-ready",
  "needs-maintainer-review",
  "needs-information",
  "duplicate-candidate",
]
```

Preserve unrelated labels in their current order and append desired owned
labels in canonical order. Run twice against its own output to prove the second
result is identical.

- [ ] **Step 10: Add the failing dry-run orchestration test**

Inject a `gh(args, stdin)` test adapter that returns the eight issue fixtures
for `issue list`. Call `runKitReconciliation` with `apply: false`. Assert that
the returned ledger contains all eight dispositions and that no mutating
arguments (`label create`, `api --method PUT`, `api --method PATCH`, or
`workflow run`) were passed to the adapter.

Run the focused test and verify RED because orchestration is not implemented.

- [ ] **Step 11: Implement dry-run orchestration and verify GREEN**

The default CLI adapter must invoke the `gh` executable with `execFile`, pass
arguments as an array, pass JSON request bodies on stdin, and reject non-zero
exit codes with stderr included. Fetch REST issues, including numeric
`issue.user.id`, with:

```text
api --paginate --slurp --method GET repos/MentallyQuill/Tavernary/issues -f state=all -f per_page=100
```

Flatten the returned pages, exclude pull requests, and retain only bodies whose
heading set contains `Kit manifest`. Map REST `issue.user` directly to numeric
`{ id, login }` identity before classification. Print the ledger as formatted
JSON in dry-run mode. Do not mutate GitHub.

Run the focused test and expect PASS.

- [ ] **Step 12: Add the failing apply orchestration test**

With `apply: true`, assert exact operations:

- list current repository labels once and create missing `kit-submission` and
  `kit-withdrawal` labels;
- replace each issue's full merged labels through `gh api --method PUT` with
  JSON stdin;
- PATCH published creates/applied edits to `closed/completed` only when live
  state or reason differs;
- preserve the existing closed state/reason for superseded issues;
- reopen a closed `unpublished-valid` issue before dispatch;
- dispatch `triage-kit-submission.yml` once for each `dispatch: true` issue.

Run the focused test and verify RED.

- [ ] **Step 13: Implement idempotent apply orchestration and verify GREEN**

Use only GitHub CLI subcommands through the adapter. Read labels with:

```text
label list --repo MentallyQuill/Tavernary --limit 100 --json name
```

Create only missing labels. Replace labels with:

```text
api --method PUT repos/MentallyQuill/Tavernary/issues/<number>/labels --input -
```

and JSON stdin `{"labels":[...]}`. Update state with:

```text
api --method PATCH repos/MentallyQuill/Tavernary/issues/<number> --input -
```

and JSON stdin containing `state` and, for published results,
`state_reason: "completed"`. Dispatch with:

```text
workflow run triage-kit-submission.yml --repo MentallyQuill/Tavernary --ref main -f issue_number=<number>
```

Compare current and desired labels/state before mutating. Dispatch only after
the issue is open and has both `issue-admitted` and `kit-submission`. A second
run against already published fixtures must perform no label/state mutation
and must not redispatch.

Expose CLI arguments:

```text
--repo MentallyQuill/Tavernary
--apply
```

Omitting `--apply` is always dry-run.

- [ ] **Step 14: Add package commands**

Modify `package.json`:

```json
"submissions:reconcile-kits": "node scripts/submissions/kit-submission-reconciliation.mjs --repo MentallyQuill/Tavernary",
"submissions:reconcile-kits:apply": "node scripts/submissions/kit-submission-reconciliation.mjs --repo MentallyQuill/Tavernary --apply"
```

- [ ] **Step 15: Update declarations and run focused tests**

Add exact input/output interfaces to the `.d.mts` file. Run:

```powershell
npm.cmd test -- tests/unit/kit-submission-reconciliation.test.ts tests/unit/admit-issue.test.ts tests/unit/triage-issue.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 16: Commit Task 3**

```powershell
git add -- scripts/submissions/kit-submission-reconciliation.mjs scripts/submissions/kit-submission-reconciliation.d.mts tests/unit/kit-submission-reconciliation.test.ts package.json
git commit -m "fix(kits): classify historical submissions"
```

---

### Task 4: Verify the Complete Local Repair

**Files:**
- Verify only; modify only files already in Tasks 1-3 if a test exposes a defect.

**Interfaces:**
- Consumes all Task 1-3 behavior.
- Produces a clean, reviewable implementation diff.

- [ ] **Step 1: Run focused regression suites**

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts tests/unit/kit-submission-reconciliation.test.ts tests/unit/triage-issue.test.ts tests/unit/validate-kit-submission.test.ts tests/unit/apply-kit-submission.test.ts tests/unit/kit-automatic-publication-workflow.test.ts tests/unit/kit-publication-workflow-hardening.test.ts tests/unit/workflows.test.ts
```

Expected: PASS with no warnings.

- [ ] **Step 2: Run formatting and static checks**

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run the repository gate**

```powershell
npm.cmd run check
```

Expected: all formatting, lint, palette, catalog, type, unit, build, and static
export checks pass.

- [ ] **Step 4: Inspect scope**

```powershell
git status --short
git diff --stat HEAD~3
git diff HEAD~3 -- scripts/submissions tests/unit
```

Expected: only the planned implementation files plus the pre-existing
untracked Project-submission plan.

---

### Task 5: Publish the Forward Fix

**Files:**
- Git/GitHub operations only.

**Interfaces:**
- Consumes the verified commits from Tasks 1-4.
- Produces the forward repair on `main`.

- [ ] **Step 1: Verify GitHub authentication and remote state**

```powershell
gh auth status
gh repo view --json nameWithOwner,url,defaultBranchRef
git fetch origin main
git rev-list --left-right --count HEAD...origin/main
```

Expected: authenticated as `MentallyQuill`; no unexpected remote divergence.

- [ ] **Step 2: Push the repair branch**

```powershell
git push origin codex/fix-kit-routing-recovery
```

Expected: branch push succeeds.

- [ ] **Step 3: Open a ready pull request**

Use `gh pr create` with:

```text
Title: Fix missing Kit submission routing

Body:
## Summary
- restore missing submission routing labels from exact issue-form fields
- keep explicit labels authoritative and conflicts fail-closed
- add idempotent historical Kit classification

## Verification
- npm.cmd run check

Closes #109
```

- [ ] **Step 4: Verify PR checks and merge**

```powershell
gh pr checks --watch
gh pr merge --merge --delete-branch
```

Expected: required checks pass and the PR merges to `main`.

- [ ] **Step 5: Refresh the local default branch**

```powershell
git switch main
git pull --ff-only origin main
```

Expected: local `main` contains the merged repair and preserves the unrelated
untracked plan.

---

### Task 6: Reconcile All Historical Kit Issues

**Files:**
- Live GitHub issue state only; no registry writes.

**Interfaces:**
- Consumes `classifyKitSubmissionHistory` and
  `reconcileOwnedKitLabels`.
- Produces accurate labels/state for issues #16, #18, #19, #20, #30, #31,
  #63, and #109.

- [ ] **Step 1: Run the reconciliation dry-run**

```powershell
npm.cmd run submissions:reconcile-kits
```

Expected: the REST-backed scan finds the same eight issues or an explicitly
reviewed superset, with this ledger:

```text
#16  superseded
#18  published-create
#19  superseded
#20  applied-edit
#30  published-create
#31  published-create
#63  published-create
#109 unpublished-valid
```

Stop before mutation if any disposition differs.

- [ ] **Step 2: Apply the reviewed reconciliation ledger**

```powershell
npm.cmd run submissions:reconcile-kits:apply
```

The script must perform every GitHub operation through its `gh` CLI adapter.
Expected terminal owned labels before #109 publication completes:

```text
#16  issue-admitted, kit-submission, duplicate-candidate
#18  issue-admitted, kit-submission, kit-published
#19  issue-admitted, kit-submission, duplicate-candidate
#20  issue-admitted, kit-submission, kit-published
#30  issue-admitted, kit-submission, kit-published
#31  issue-admitted, kit-submission, kit-published
#63  issue-admitted, kit-submission, kit-published
#109 issue-admitted, kit-submission
```

Preserve any unrelated labels returned by the live read.

- [ ] **Step 3: Verify terminal and recoverable issue states**

```text
#16  remain closed with its existing reason
#18  closed as completed
#19  remain closed with its existing duplicate reason
#20  closed as completed
#30  closed as completed
#31  closed as completed
#63  closed as completed
#109 open
```

Do not reopen #16 or #19. Do not close #109 before publication.

- [ ] **Step 4: Re-read and verify all eight issues**

Use `gh issue view` for every issue and compare state, state reason, and labels
with Steps 2-3. Expected: no stale `needs-maintainer-review` or
`kit-publication-ready` labels remain on published records.

---

### Task 7: Publish #109 and Prove the Live Result

**Files:**
- Live workflow, registry, generated catalog, Pages deployment, and site only.

**Interfaces:**
- Consumes the repaired routing and official Kit workflows.
- Produces a canonical `Super Awesome Test Kit` and live-site proof.

- [ ] **Step 1: Watch validation and publication dispatched by reconciliation**

Use:

```powershell
gh run list --repo MentallyQuill/Tavernary --limit 20 --json databaseId,workflowName,displayTitle,status,conclusion,url,headSha
$runs = gh run list --repo MentallyQuill/Tavernary --limit 20 --json databaseId,displayTitle | ConvertFrom-Json
$validationRun = ($runs | Where-Object { $_.displayTitle -eq 'Kit #109: Validate submission' } | Select-Object -First 1).databaseId
gh run watch $validationRun --repo MentallyQuill/Tavernary --exit-status
$runs = gh run list --repo MentallyQuill/Tavernary --limit 20 --json databaseId,displayTitle | ConvertFrom-Json
$publicationRun = ($runs | Where-Object { $_.displayTitle -eq 'Kit #109: Publish approved Kit' } | Select-Object -First 1).databaseId
gh run watch $publicationRun --repo MentallyQuill/Tavernary --exit-status
```

Expected: both numeric run IDs resolve and both runs succeed.

- [ ] **Step 2: Verify canonical and generated data on `main`**

```powershell
git pull --ff-only origin main
rg -n "Super Awesome Test Kit|source_issue_number.*109" data/registry/kits src/generated/catalog.json
```

Expected: one canonical Kit record sourced from #109 and one generated catalog
entry.

- [ ] **Step 3: Verify exact-SHA Pages deployment**

Read the publication commit SHA and locate its Pages run:

```powershell
$publicationCommit = gh api 'repos/MentallyQuill/Tavernary/commits?path=data/registry/kits&per_page=20' | ConvertFrom-Json | Where-Object { $_.commit.message -eq 'feat(kits): publish issue #109' } | Select-Object -First 1
$pagesRuns = gh run list --repo MentallyQuill/Tavernary --workflow deploy-pages.yml --limit 20 --json databaseId,displayTitle,status,conclusion,headSha,url | ConvertFrom-Json
$pagesRun = ($pagesRuns | Where-Object { $_.displayTitle -like "*$($publicationCommit.sha)*" } | Select-Object -First 1).databaseId
gh run watch $pagesRun --repo MentallyQuill/Tavernary --exit-status
```

Expected: the publication commit and numeric Pages run ID resolve, and the
deployment for that publication SHA succeeds.

- [ ] **Step 4: Verify issue lifecycle**

```powershell
gh issue view 109 --repo MentallyQuill/Tavernary --json state,stateReason,labels,comments,url
```

Expected: closed/completed with `issue-admitted`, `kit-submission`, and
`kit-published`; no stale triage label.

- [ ] **Step 5: Verify the live site**

Open the production Tavernary URL in the in-app browser, enter Kits mode, and
search for `Super Awesome Test Kit`. Confirm its title, description, and four
project components render.

- [ ] **Step 6: Run the final GitHub CLI audit**

Re-run the `Kit manifest in:body` inventory and compare every issue with the
canonical registry. Expected:

- no valid unpublished Kit submission remains;
- no published Kit issue retains a stale triage label;
- no historical issue lacks `kit-submission`;
- #109 is visible in production.
