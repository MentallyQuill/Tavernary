# GitHub Workflow Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Tavernary GitHub workflow a consistent category-prefixed display name and an object-specific run name.

**Architecture:** Change only top-level GitHub Actions `name` and `run-name` metadata. Keep workflow filenames, triggers, permissions, inputs, jobs, scripts, and cross-workflow dispatch targets unchanged; protect the contract with parsed-YAML unit tests.

**Tech Stack:** GitHub Actions YAML, TypeScript, Vitest, `yaml`

## Global Constraints

- Every display name uses `Category: Clear action and outcome`.
- Workflow filenames remain unchanged.
- Dynamic run names identify the issue, pull request, ref, source SHA, or catalog scope available to that trigger.
- No triggers, permissions, inputs, jobs, scripts, or publication behavior may change.
- Existing cross-workflow dispatches must continue targeting the unchanged workflow filenames.

---

### Task 1: Standardize workflow display names

**Files:**
- Modify: `tests/unit/workflows.test.ts`
- Modify: `.github/workflows/admit-issue.yml`
- Modify: `.github/workflows/triage-submission.yml`
- Modify: `.github/workflows/generate-project-submission.yml`
- Modify: `.github/workflows/project-submission-lifecycle.yml`
- Modify: `.github/workflows/triage-kit-submission.yml`
- Modify: `.github/workflows/apply-kit-submission.yml`
- Modify: `.github/workflows/apply-kit-withdrawal.yml`
- Modify: `.github/workflows/refresh-catalog.yml`
- Modify: `.github/workflows/enrich-catalog.yml`
- Modify: `.github/workflows/backfill-repository-identities.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: existing `workflow(name)` YAML loader in `tests/unit/workflows.test.ts`
- Produces: the approved top-level `name` contract for all 12 workflow files

- [ ] **Step 1: Write the failing display-name contract test**

Add this test to `tests/unit/workflows.test.ts`:

```ts
test("uses category-prefixed workflow display names", async () => {
  const expectedNames = {
    "admit-issue": "Submission intake: Check issue eligibility",
    "triage-submission": "Project submissions: Validate submission",
    "generate-project-submission":
      "Project submissions: Create review PR",
    "project-submission-lifecycle":
      "Project submissions: Process review result",
    "triage-kit-submission": "Kit submissions: Validate submission",
    "apply-kit-submission":
      "Kit submissions: Publish approved Kit",
    "apply-kit-withdrawal":
      "Kit submissions: Withdraw published Kit",
    "refresh-catalog": "Catalog maintenance: Refresh source data",
    "enrich-catalog":
      "Catalog maintenance: Enrich project metadata",
    "backfill-repository-identities":
      "Catalog maintenance: Backfill repository IDs",
    ci: "Site: Validate changes",
    "deploy-pages": "Site: Deploy to GitHub Pages",
  } as const;

  for (const [file, expectedName] of Object.entries(expectedNames)) {
    expect((await workflow(file)).name).toBe(expectedName);
  }
});
```

- [ ] **Step 2: Run the focused test and confirm the old names fail**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: FAIL in `uses category-prefixed workflow display names`, showing the current inconsistent names.

- [ ] **Step 3: Replace only the top-level display names**

Set the first `name:` field in each workflow to the exact quoted string asserted
above. The quotes are required because each value contains a colon followed by
a space. Do not rename files or alter any other YAML key.

Examples:

```yaml
name: "Project submissions: Create review PR"
```

```yaml
name: "Kit submissions: Publish approved Kit"
```

```yaml
name: "Site: Validate changes"
```

- [ ] **Step 4: Run the focused workflow tests**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the display-name change**

```powershell
git add .github/workflows/admit-issue.yml .github/workflows/triage-submission.yml .github/workflows/generate-project-submission.yml .github/workflows/project-submission-lifecycle.yml .github/workflows/triage-kit-submission.yml .github/workflows/apply-kit-submission.yml .github/workflows/apply-kit-withdrawal.yml .github/workflows/refresh-catalog.yml .github/workflows/enrich-catalog.yml .github/workflows/backfill-repository-identities.yml .github/workflows/ci.yml .github/workflows/deploy-pages.yml tests/unit/workflows.test.ts
git commit -m "ci(actions): clarify workflow names"
```

### Task 2: Add consistent object-specific run names

**Files:**
- Modify: `tests/unit/workflows.test.ts`
- Modify: `.github/workflows/admit-issue.yml`
- Modify: `.github/workflows/triage-submission.yml`
- Modify: `.github/workflows/generate-project-submission.yml`
- Modify: `.github/workflows/project-submission-lifecycle.yml`
- Modify: `.github/workflows/triage-kit-submission.yml`
- Modify: `.github/workflows/apply-kit-submission.yml`
- Modify: `.github/workflows/apply-kit-withdrawal.yml`
- Modify: `.github/workflows/refresh-catalog.yml`
- Modify: `.github/workflows/enrich-catalog.yml`
- Modify: `.github/workflows/backfill-repository-identities.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: approved display names from Task 1 and each workflow's existing trigger payload or inputs
- Produces: a top-level `run-name` on every workflow without changing dispatch filenames

- [ ] **Step 1: Write the failing run-name coverage test**

Add this test to `tests/unit/workflows.test.ts`:

```ts
test("identifies the object and action in every workflow run name", async () => {
  const expectedRunNameParts = {
    "admit-issue": ["Issue #", "Check submission eligibility"],
    "triage-submission": ["Project #", "Validate submission"],
    "generate-project-submission": ["Project #", "Create review PR"],
    "project-submission-lifecycle": [
      "Project review PR #",
      "Process result",
    ],
    "triage-kit-submission": ["Kit #", "Validate submission"],
    "apply-kit-submission": ["Kit #", "Publish approved Kit"],
    "apply-kit-withdrawal": ["Kit #", "Withdraw published Kit"],
    "refresh-catalog": ["Catalog:", "Refresh"],
    "enrich-catalog": ["Catalog:", "Enrich", "project metadata"],
    "backfill-repository-identities": [
      "Catalog:",
      "Backfill repository IDs",
    ],
    ci: ["Site:", "Validate"],
    "deploy-pages": ["Site:", "Deploy"],
  } as const;

  for (const [file, expectedParts] of Object.entries(
    expectedRunNameParts,
  )) {
    const runName = String((await workflow(file))["run-name"] ?? "");
    for (const expectedPart of expectedParts) {
      expect(runName).toContain(expectedPart);
    }
  }
});
```

- [ ] **Step 2: Run the focused test and confirm missing or legacy run names fail**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: FAIL because most workflows have no `run-name`, while the existing catalog refresh and Pages deployment names use legacy wording.

- [ ] **Step 3: Add exact submission and Kit run names**

Add these top-level values after `name:`:

```yaml
# admit-issue.yml
run-name: "Issue #${{ github.event.issue.number }}: Check submission eligibility"

# triage-submission.yml
run-name: "Project #${{ inputs.issue_number || github.event.issue.number }}: Validate submission"

# generate-project-submission.yml
run-name: "Project #${{ inputs.issue_number }}: Create review PR"

# project-submission-lifecycle.yml
run-name: "Project review PR #${{ github.event.pull_request.number }}: Process result"

# triage-kit-submission.yml
run-name: "Kit #${{ inputs.issue_number || github.event.issue.number }}: Validate submission"

# apply-kit-submission.yml
run-name: "Kit #${{ inputs.issue_number }}: Publish approved Kit"

# apply-kit-withdrawal.yml
run-name: "Kit #${{ github.event.issue.number }}: Withdraw published Kit"
```

- [ ] **Step 4: Add exact catalog and site run names**

Use these top-level values:

```yaml
# enrich-catalog.yml
run-name: "Catalog: Enrich ${{ inputs.enrichment_scope }} project metadata"

# backfill-repository-identities.yml
run-name: "Catalog: Backfill repository IDs"

# deploy-pages.yml
run-name: "Site: Deploy ${{ inputs.source_sha || github.sha }}"
```

Replace `refresh-catalog.yml`'s existing `run-name` with:

```yaml
run-name: >-
  ${{ github.event_name == 'schedule'
    && 'Catalog: Refresh scheduled incremental'
    || inputs.mode == 'baseline'
    && format('Catalog: Refresh baseline queue (up to {0} projects)', inputs.batch_size)
    || inputs.project_id
    && format('Catalog: Refresh {0} project {1}', inputs.mode, inputs.project_id)
    || format('Catalog: Refresh {0}', inputs.mode) }}
```

Add this trigger-safe value to `ci.yml`:

```yaml
run-name: >-
  ${{ github.event_name == 'pull_request'
    && format('Site: Validate PR #{0}', github.event.pull_request.number)
    || format('Site: Validate {0}', github.ref_name) }}
```

- [ ] **Step 5: Run focused tests and verify unchanged dispatch filenames**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: PASS, including existing assertions for:

```text
gh workflow run triage-submission.yml
gh workflow run triage-kit-submission.yml
gh workflow run generate-project-submission.yml
gh workflow run deploy-pages.yml
```

- [ ] **Step 6: Run the full repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck, all unit tests, production build, and static-export verification pass.

- [ ] **Step 7: Review the metadata-only diff**

Run:

```powershell
git diff --check
git diff -- .github/workflows tests/unit/workflows.test.ts
```

Expected: only top-level `name`, top-level `run-name`, and the two workflow metadata tests changed.

- [ ] **Step 8: Commit the run-name change**

```powershell
git add .github/workflows/admit-issue.yml .github/workflows/triage-submission.yml .github/workflows/generate-project-submission.yml .github/workflows/project-submission-lifecycle.yml .github/workflows/triage-kit-submission.yml .github/workflows/apply-kit-submission.yml .github/workflows/apply-kit-withdrawal.yml .github/workflows/refresh-catalog.yml .github/workflows/enrich-catalog.yml .github/workflows/backfill-repository-identities.yml .github/workflows/ci.yml .github/workflows/deploy-pages.yml tests/unit/workflows.test.ts
git commit -m "ci(actions): identify workflow runs"
```
