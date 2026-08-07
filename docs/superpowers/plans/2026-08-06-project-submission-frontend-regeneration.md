# Project Submission Frontend Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make automated frontend-submission regeneration idempotent and use the repaired workflow to restore PR #332 to one PocketRisu vocabulary entry.

**Architecture:** The workflow owns cleanup of automation-generated branch state. On an existing generated PR it will recreate the automation branch directly from current `origin/main` before marker-scoped cleanup, then run the unchanged generator against that canonical baseline. PR #332 will be regenerated through this patched workflow so its transaction marker and generated head remain consistent.

**Tech Stack:** GitHub Actions YAML, Bash, TypeScript, Vitest, GitHub CLI, Node.js 24.

## Global Constraints

- Preserve the existing maintainer-correction SHA guard.
- Preserve collision suffixing when current `main` genuinely owns the colliding frontend ID or label.
- Do not modify or commit unrelated TavernKeeper files from the primary checkout.
- Do not create a new pull request without a separate user request.
- Use GitHub CLI with network permission enabled.

---

### Task 1: Rebuild Existing Generated Branches from Canonical Main

**Files:**
- Modify: `.github/workflows/generate-project-submission.yml`
- Create: `scripts/submissions/reset-project-submission-branch.mjs`
- Test: `tests/unit/workflows.test.ts`
- Test: `tests/unit/reset-project-submission-branch.test.ts`

**Interfaces:**
- Consumes: existing `PR_NUMBER`, `REMOTE_SHA`, `MARKER_SHA`, `BRANCH`, and fetched `origin/main` workflow state.
- Produces: an existing-PR regeneration branch whose `HEAD` and catalog files exactly match `origin/main` before `generate-project-submission.mjs` runs.

- [ ] **Step 1: Write the failing Git-history regression test**

Create a temporary bare remote with stale generated PocketRisu history and an overlapping canonical vocabulary commit on `main`. Invoke the reset CLI and assert:

```ts
expect(result.status, result.stderr).toBe(0);
expect(git(runner, "branch", "--show-current")).toBe(branch);
expect(git(runner, "rev-parse", "HEAD")).toBe(
  git(runner, "rev-parse", "origin/main"),
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/reset-project-submission-branch.test.ts
```

Expected: FAIL because the reset CLI does not exist.

- [ ] **Step 3: Add the tested branch-reset CLI and workflow call**

Validate the generated branch name and reset it without replaying stale commits:

```js
execFileSync("git", ["checkout", "-B", branch, "origin/main"], {
  cwd,
  stdio: "inherit",
});
```

Call the CLI inside the existing-PR workflow branch before the marker-declared generated-path loop. Remove the rebase of stale generated history.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/reset-project-submission-branch.test.ts tests/unit/workflows.test.ts tests/unit/frontend-reconciliation.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 5: Run static verification**

Run:

```powershell
npm.cmd run format:check
npm.cmd run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the systemic fix**

```powershell
git add -- .github/workflows/generate-project-submission.yml scripts/submissions/reset-project-submission-branch.mjs tests/unit/reset-project-submission-branch.test.ts tests/unit/workflows.test.ts docs/superpowers/plans/2026-08-06-project-submission-frontend-regeneration.md docs/superpowers/specs/2026-08-06-project-submission-frontend-regeneration-design.md
git commit -m "fix(submissions): reset frontend vocabulary"
```

### Task 2: Regenerate and Verify PR #332

**Files:**
- Generated remotely by the workflow: `data/registry/projects/pocketrisu-pocketrisu.json`
- Generated remotely by the workflow: `data/registry/sources/github-1183860600.json`
- Generated remotely by the workflow: `data/snapshots/github/github-1183860600.json`
- Generated remotely by the workflow: `data/vocabularies/frontends.json`

**Interfaces:**
- Consumes: pushed `codex/fix-frontend-regeneration` workflow ref and issue `327`.
- Produces: PR #332 with one PocketRisu vocabulary entry, a project record referencing that entry, an updated transaction marker, and passing required checks.

- [ ] **Step 1: Push only the reviewed systemic-fix branch**

```powershell
git push origin codex/fix-frontend-regeneration
```

Do not create a new pull request.

- [ ] **Step 2: Dispatch forced regeneration from the patched workflow ref**

```powershell
gh workflow run generate-project-submission.yml --repo MentallyQuill/Tavernary --ref codex/fix-frontend-regeneration -f issue_number=327 -f force_regeneration=true
```

Expected: one `Project #327: Create review PR` run starts from the feature ref.

- [ ] **Step 3: Watch regeneration to completion**

```powershell
gh run watch <run-id> --repo MentallyQuill/Tavernary --exit-status
```

Expected: workflow exits successfully and updates `automation/project-submission-327`.

- [ ] **Step 4: Inspect the regenerated PR patch and transaction marker**

```powershell
gh pr diff 332 --repo MentallyQuill/Tavernary
gh pr view 332 --repo MentallyQuill/Tavernary --json body,headRefOid,mergeStateStatus
```

Expected: exactly one vocabulary entry labeled `PocketRisu`; the project record references its ID; marker `generated_head_sha` equals `headRefOid`.

- [ ] **Step 5: Watch required PR checks**

```powershell
gh pr checks 332 --repo MentallyQuill/Tavernary --watch --fail-fast=false
```

Expected: `verify` passes; route-dependent skipped checks remain non-failing.

- [ ] **Step 6: Reinspect repository state**

```powershell
git status --short
git log -3 --oneline --decorate
```

Expected: feature worktree is clean; the primary checkout's TavernKeeper files and cherry-pick state were never altered.
