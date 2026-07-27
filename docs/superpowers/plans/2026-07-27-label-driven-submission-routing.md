# Label-Driven Submission Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route admitted Project and Kit submissions through their validators by structured labels instead of issue-title prefixes.

**Architecture:** The admission script will normalize GitHub's two label representations into one typed `submission_type` output. The admission workflow will dispatch exactly one validator from that output, while the Kit validator will adopt the same label guard already used by Project validation. Existing validation scripts remain the live-state and content authority.

**Tech Stack:** Node.js 24, JavaScript ES modules, TypeScript declaration files, GitHub Actions YAML, Vitest 4, PowerShell/npm.cmd

## Global Constraints

- `project-submission` and `kit-submission` are the only submission-routing authorities.
- `submission_type` is exactly `project`, `kit`, `none`, or `conflict`.
- Neither label is valid for ordinary non-submission issues and causes no dispatch.
- Both labels fail closed and dispatch neither validator.
- Manual validator dispatch remains available and validator live-state checks remain authoritative.
- Do not change issue forms, the submission builder, catalog schemas, generated records, or publication behavior.
- Preserve unrelated worktree changes and stage only files named by the active task.

---

### Task 1: Add typed submission-label classification

**Files:**

- Modify: `tests/unit/admit-issue.test.ts:9-25,181-190`
- Modify: `scripts/submissions/admit-issue.mjs:186-191`
- Modify: `scripts/submissions/admit-issue.d.mts:1-46`

**Interfaces:**

- Consumes: `event.issue.labels` as `Array<string | { name: string }>`
- Produces: `submissionTypeFromLabels(labels): "project" | "kit" | "none" | "conflict"`
- Produces: `issueAdmissionOutputs(...).submission_type` with the same four-value union

- [ ] **Step 1: Extend the admission test fixture to accept labels**

Change the helper signature and issue fixture in
`tests/unit/admit-issue.test.ts`:

```ts
function event(
  number = 11,
  association = "NONE",
  action: "opened" | "reopened" = "opened",
  labels: Array<string | { name: string }> = [],
) {
  return {
    action,
    repository: { full_name: "MentallyQuill/Tavernary" },
    issue: {
      number,
      state: "open",
      created_at: `2026-07-25T00:${String(number).padStart(2, "0")}:00Z`,
      author_association: association,
      user: { id: 42, login: "submitter" },
      labels,
    },
  };
}
```

- [ ] **Step 2: Write failing classification and output tests**

Import `submissionTypeFromLabels` beside the existing admission exports and add:

```ts
test.each([
  [["project-submission"], "project"],
  [[{ name: "project-submission" }], "project"],
  [["kit-submission"], "kit"],
  [[{ name: "kit-submission" }], "kit"],
  [[], "none"],
  [["bug"], "none"],
  [["project-submission", "kit-submission"], "conflict"],
])("classifies submission labels %j as %s", (labels, expected) => {
  expect(submissionTypeFromLabels(labels)).toBe(expected);
});

test("reports admission outputs for downstream workflow dispatch", () => {
  expect(
    issueAdmissionOutputs(
      { admitted: true },
      event(21, "COLLABORATOR", "opened", ["project-submission"]),
    ),
  ).toEqual({
    admitted: "true",
    issue_number: "21",
    submission_type: "project",
  });
});
```

- [ ] **Step 3: Run the focused test and confirm RED**

Run:

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts
```

Expected: FAIL because `submissionTypeFromLabels` is not exported and
`submission_type` is absent from `issueAdmissionOutputs`.

- [ ] **Step 4: Implement the minimal classifier and output**

Add above `issueAdmissionOutputs` in
`scripts/submissions/admit-issue.mjs`:

```js
export function submissionTypeFromLabels(labels = []) {
  const names = new Set(
    labels
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean),
  );
  const project = names.has("project-submission");
  const kit = names.has("kit-submission");

  if (project && kit) return "conflict";
  if (project) return "project";
  if (kit) return "kit";
  return "none";
}
```

Extend the output:

```js
export function issueAdmissionOutputs(decision, event) {
  return {
    admitted: String(decision.admitted),
    issue_number: String(event.issue.number),
    submission_type: submissionTypeFromLabels(event.issue.labels),
  };
}
```

- [ ] **Step 5: Declare the exact public types**

Add to `scripts/submissions/admit-issue.d.mts`:

```ts
export type AdmissionSubmissionType =
  | "project"
  | "kit"
  | "none"
  | "conflict";

export function submissionTypeFromLabels(
  labels: Array<string | { name: string }>,
): AdmissionSubmissionType;
```

Extend the declared `issueAdmissionOutputs` return:

```ts
{
  admitted: string;
  issue_number: string;
  submission_type: AdmissionSubmissionType;
}
```

- [ ] **Step 6: Run the focused test and confirm GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts
```

Expected: PASS, including string labels, object labels, ordinary issues, and
conflicting labels.

- [ ] **Step 7: Commit the classifier**

```powershell
git add -- scripts/submissions/admit-issue.mjs scripts/submissions/admit-issue.d.mts tests/unit/admit-issue.test.ts
git commit -m "fix(submissions): classify routing labels"
```

### Task 2: Rewire Project and Kit workflow routing

**Files:**

- Modify: `tests/unit/workflows.test.ts:604-633,774-795`
- Modify: `.github/workflows/admit-issue.yml:34-52`
- Modify: `.github/workflows/triage-kit-submission.yml:27-40`

**Interfaces:**

- Consumes: `steps.admission.outputs.submission_type` from Task 1
- Preserves: `triage-submission.yml` and `triage-kit-submission.yml` manual `issue_number` inputs
- Preserves: validator-owned live issue validation, labels, review PRs, Kit publication, and concurrency groups

- [ ] **Step 1: Write failing workflow contract assertions**

Extend `continues admitted submissions in the admission run` in
`tests/unit/workflows.test.ts`:

```ts
expect(source).toContain(
  "steps.admission.outputs.submission_type == 'project'",
);
expect(source).toContain(
  "steps.admission.outputs.submission_type == 'kit'",
);
expect(source).toContain(
  "steps.admission.outputs.submission_type == 'conflict'",
);
expect(source).not.toContain("startsWith(github.event.issue.title");
```

Extend the Project triage assertions:

```ts
expect(source).toContain(
  "contains(github.event.issue.labels.*.name, 'project-submission')",
);
expect(source).not.toContain("startsWith(github.event.issue.title");
```

Add a matching Kit workflow contract test:

```ts
test("Kit triage routes by labels while preserving manual recovery", async () => {
  const triage = await workflow("triage-kit-submission");
  const source = await readFile(
    resolve(workflowDirectory, "triage-kit-submission.yml"),
    "utf8",
  );

  expect(triage.on.issues.types).toEqual(["labeled", "edited"]);
  expect(triage.on.workflow_dispatch.inputs.issue_number).toMatchObject({
    required: true,
    type: "number",
  });
  expect(source).toContain(
    "contains(github.event.issue.labels.*.name, 'kit-submission')",
  );
  expect(source).toContain("contains(github.event.issue.labels.*.name, 'issue-admitted')");
  expect(source).toContain("github.event_name == 'workflow_dispatch'");
  expect(source).not.toContain("startsWith(github.event.issue.title");
});
```

- [ ] **Step 2: Run the workflow test and confirm RED**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: FAIL because admission and Kit routing still use title prefixes and
there is no conflict guard.

- [ ] **Step 3: Dispatch admitted submissions from the typed output**

In `.github/workflows/admit-issue.yml`, replace both title conditions with:

```yaml
      - name: Reject conflicting submission labels
        if: >-
          steps.admission.outputs.admitted == 'true' &&
          steps.admission.outputs.submission_type == 'conflict'
        run: |
          echo "::error::Issue has both project-submission and kit-submission labels."
          exit 1
      - name: Dispatch project submission triage
        if: >-
          steps.admission.outputs.admitted == 'true' &&
          steps.admission.outputs.submission_type == 'project'
        run: >
          gh workflow run triage-submission.yml
          --ref main
          -f issue_number="${{ steps.admission.outputs.issue_number }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Dispatch Kit submission triage
        if: >-
          steps.admission.outputs.admitted == 'true' &&
          steps.admission.outputs.submission_type == 'kit'
        run: >
          gh workflow run triage-kit-submission.yml
          --ref main
          -f issue_number="${{ steps.admission.outputs.issue_number }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Do not change the admission trigger, permissions, or concurrency group.

- [ ] **Step 4: Make Kit event routing label-driven**

In `.github/workflows/triage-kit-submission.yml`, replace:

```yaml
startsWith(github.event.issue.title, '[Kit submission]')
```

with:

```yaml
contains(github.event.issue.labels.*.name, 'kit-submission')
```

Do not change the unconditional `workflow_dispatch` branch or validator steps.

- [ ] **Step 5: Run both focused suites and confirm GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts tests/unit/workflows.test.ts
```

Expected: PASS with no title-prefix routing assertions remaining.

- [ ] **Step 6: Run complete static and unit verification**

Run each command independently:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
```

Expected: all commands exit `0`. If an unrelated pre-existing failure appears,
record its exact command and output and verify the two focused suites still pass
before deciding whether it is in scope.

- [ ] **Step 7: Inspect the final scoped diff**

Run:

```powershell
git diff --check
git diff -- scripts/submissions/admit-issue.mjs scripts/submissions/admit-issue.d.mts tests/unit/admit-issue.test.ts .github/workflows/admit-issue.yml .github/workflows/triage-kit-submission.yml tests/unit/workflows.test.ts
git status --short
```

Expected: no whitespace errors; only the three Task 2 files are pending. The
three Task 1 files are already committed, and any unrelated user changes remain
preserved.

- [ ] **Step 8: Commit the workflow repair**

```powershell
git add -- .github/workflows/admit-issue.yml .github/workflows/triage-kit-submission.yml tests/unit/workflows.test.ts
git commit -m "fix(submissions): route admission by labels"
```

- [ ] **Step 9: Verify commit boundaries**

Run:

```powershell
git show --stat --oneline HEAD~1
git show --stat --oneline HEAD
git status --short
```

Expected: the classifier commit contains its three files, the workflow commit
contains its three files, and unrelated worktree changes remain uncommitted.
