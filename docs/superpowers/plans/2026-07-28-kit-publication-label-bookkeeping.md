# Kit Publication Label Bookkeeping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kit publication reliably apply `kit-published` with supported,
idempotent GitHub CLI commands while keeping issue bookkeeping warning-only.

**Architecture:** Keep the correction inside the existing finalization shell
step. Replace unsupported label existence checks with one forced label ensure,
then conditionally apply the label while preserving deployment order and
best-effort issue closure.

**Tech Stack:** GitHub Actions YAML, Bash, GitHub CLI, Vitest, TypeScript

## Global Constraints

- Label creation, label application, and issue closure remain warning-only
  bookkeeping after exact-SHA deployment dispatch.
- Do not backfill issue #127.
- Do not change publication, validation, deployment, or unrelated workflows.
- Preserve unrelated worktree changes.
- Do not commit unless explicitly requested.

---

### Task 1: Correct Kit publication label bookkeeping

**Files:**

- Modify: `tests/unit/kit-publication-workflow-hardening.test.ts`
- Modify: `.github/workflows/apply-kit-submission.yml`

**Interfaces:**

- Consumes: the `Finalize published issue` workflow step and
  `${{ inputs.issue_number }}`
- Produces: a supported, idempotent `kit-published` label ensure followed by
  best-effort issue labeling and closure

- [x] **Step 1: Write the failing regression assertions**

Replace the existing unsupported-command assertion with assertions that reject
`gh label view`, require `--force`, and preserve ordering:

```ts
expect(bookkeeping?.run).not.toContain("gh label view");
expect(bookkeeping?.run).toMatch(
  /gh label create kit-published[\s\S]*--force/,
);
expect(bookkeeping?.run?.indexOf("gh label create kit-published")).toBeLessThan(
  bookkeeping?.run?.indexOf(
    'gh issue edit "${{ inputs.issue_number }}" --add-label kit-published',
  ) ?? -1,
);
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: FAIL because the workflow still contains `gh label view` and does not
use `gh label create ... --force`.

- [x] **Step 3: Apply the minimal workflow correction**

Replace the two label-view branches with:

```bash
if ! gh label create kit-published \
  --color "1d76db" \
  --description "Kit publication has been applied to the catalog." \
  --force; then
  echo "::warning title=Kit publication bookkeeping::The Kit was published and deployment was requested, but the kit-published label could not be ensured."
elif ! gh issue edit "${{ inputs.issue_number }}" --add-label kit-published; then
  echo "::warning title=Kit publication bookkeeping::The Kit was published and deployment was requested, but issue #${{ inputs.issue_number }} could not be labeled."
fi
```

Keep the existing warning-only issue-close block immediately afterward.

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: PASS.

- [x] **Step 5: Run adjacent workflow verification**

Run:

```powershell
npm.cmd test -- tests/unit/kit-publication-workflow-hardening.test.ts tests/unit/kit-automatic-publication-workflow.test.ts tests/unit/workflows.test.ts
```

Expected: all selected tests PASS with no failures.

- [x] **Step 6: Check formatting and inspect the final diff**

Run:

```powershell
npm.cmd exec prettier -- --check .github/workflows/apply-kit-submission.yml tests/unit/kit-publication-workflow-hardening.test.ts
git diff --check
git diff -- .github/workflows/apply-kit-submission.yml tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: formatting and whitespace checks pass; the diff contains only the
approved workflow and regression-test changes.
