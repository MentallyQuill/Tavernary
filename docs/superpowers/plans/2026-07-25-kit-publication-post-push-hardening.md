# Kit Publication Post-Push Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make exact-SHA deployment dispatch a required consequence of a successful Kit registry push while preventing issue-label bookkeeping failures from falsely failing publication.

**Architecture:** Keep the existing registry mutation, validation, rebase, and push path unchanged. Reorder the two post-push steps so exact-SHA deployment dispatch runs first and remains fatal, then make label creation and issue labeling an explicitly warning-only bookkeeping step.

**Tech Stack:** GitHub Actions YAML, Bash, GitHub CLI, Vitest, TypeScript, `yaml`

## Global Constraints

- Validation, tests, commit, rebase, push, and exact-SHA deployment dispatch remain required.
- `kit-published` label creation and issue labeling are best-effort bookkeeping.
- Bookkeeping failures must emit a visible GitHub Actions warning and return success.
- Do not change Kit validation, approval, withdrawal, or Pages build behavior.
- Preserve unrelated worktree changes and do not create a commit.

---

### Task 1: Harden Kit publication post-push behavior

**Files:**
- Create: `tests/unit/kit-publication-workflow-hardening.test.ts`
- Modify: `.github/workflows/apply-kit-submission.yml`

**Interfaces:**
- Consumes: `steps.commit.outputs.sha`, `inputs.issue_number`, `secrets.GITHUB_TOKEN`
- Produces: a required `Deploy updated catalog` step followed by a non-failing `Mark issue published` bookkeeping step

- [ ] **Step 1: Write the failing deployment-order test**

Create `tests/unit/kit-publication-workflow-hardening.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";
import { parse } from "yaml";

async function publicationSteps() {
  const source = await readFile(
    resolve(".github/workflows/apply-kit-submission.yml"),
    "utf8",
  );
  const document = parse(source) as {
    jobs: {
      publish: {
        steps: Array<{
          name?: string;
          run?: string;
          "continue-on-error"?: boolean;
        }>;
      };
    };
  };
  return document.jobs.publish.steps;
}

test("dispatches the exact published Kit commit before issue bookkeeping", async () => {
  const steps = await publicationSteps();
  const deploy = steps.findIndex(
    (step) => step.name === "Deploy updated catalog",
  );
  const bookkeeping = steps.findIndex(
    (step) => step.name === "Mark issue published",
  );

  expect(deploy).toBeGreaterThanOrEqual(0);
  expect(bookkeeping).toBeGreaterThan(deploy);
  expect(steps[deploy]?.run).toContain(
    'source_sha="${{ steps.commit.outputs.sha }}"',
  );
  expect(steps[deploy]?.["continue-on-error"]).not.toBe(true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: FAIL because `Mark issue published` currently appears before
`Deploy updated catalog`.

- [ ] **Step 3: Reorder the post-push steps**

In `.github/workflows/apply-kit-submission.yml`, move the existing exact-SHA
deployment step immediately after `Commit canonical Kit`. Keep its command and
token environment unchanged:

```yaml
      - name: Deploy updated catalog
        run: gh workflow run deploy-pages.yml --ref main -f source_sha="${{ steps.commit.outputs.sha }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: PASS with 1 test.

- [ ] **Step 5: Add the failing bookkeeping test**

Append one test to `tests/unit/kit-publication-workflow-hardening.test.ts`:

```ts
test("treats Kit issue labeling as warning-only bookkeeping", async () => {
  const steps = await publicationSteps();
  const bookkeeping = steps.find(
    (step) => step.name === "Mark issue published",
  );

  expect(bookkeeping?.run).toContain("gh label view kit-published");
  expect(bookkeeping?.run).toContain("gh label create kit-published");
  expect(bookkeeping?.run).toContain(
    'gh issue edit "${{ inputs.issue_number }}" --add-label kit-published',
  );
  expect(bookkeeping?.run).toContain(
    "::warning title=Kit publication bookkeeping::",
  );
  expect(bookkeeping?.run).toMatch(
    /if ! gh issue edit[\s\S]*then[\s\S]*::warning/,
  );
});
```

- [ ] **Step 6: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: FAIL because the current bookkeeping step neither ensures the label
nor guards issue-label failure.

- [ ] **Step 7: Implement warning-only label bookkeeping**

Replace `Mark issue published` with:

```yaml
      - name: Mark issue published
        shell: bash
        run: |
          if ! gh label view kit-published >/dev/null 2>&1; then
            gh label create kit-published \
              --color "1d76db" \
              --description "Kit publication has been applied to the catalog." ||
              true
          fi
          if ! gh label view kit-published >/dev/null 2>&1; then
            echo "::warning title=Kit publication bookkeeping::The Kit was published and deployment was requested, but the kit-published label could not be ensured."
          elif ! gh issue edit "${{ inputs.issue_number }}" --add-label kit-published; then
            echo "::warning title=Kit publication bookkeeping::The Kit was published and deployment was requested, but issue #${{ inputs.issue_number }} could not be labeled."
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Every branch ends successfully. The step stays green while surfacing failures
as workflow warnings.

- [ ] **Step 8: Run focused workflow verification**

Run:

```powershell
npm.cmd test -- tests/unit/kit-publication-workflow-hardening.test.ts tests/unit/workflows.test.ts
```

Expected: PASS with no failed tests.

- [ ] **Step 9: Run the complete repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, catalog validation/build, type checking, unit tests,
production build, and export verification all pass.

- [ ] **Step 10: Inspect final scope without committing**

Run:

```powershell
git diff --check
git status --short
git diff -- .github/workflows/apply-kit-submission.yml tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: only the approved workflow behavior and its focused test are part of
the implementation diff; the approved spec and plan remain separate untracked
documentation, and unrelated worktree changes remain untouched.
