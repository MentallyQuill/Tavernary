# Resolve Outstanding GitHub Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore TavernKeeper reconciliation, release the approved utility-first repair path, and close the remaining actionable GitHub queue through validated automation.

**Architecture:** Extend the existing TavernKeeper immutable-report validator with a version-bound policy-4 branch, publish it independently, then synchronize and release the already-reviewed utility-provider PR. Repository workflows remain the sole owners of generated submission branches, issue transitions, and deployed catalog transactions.

**Tech Stack:** Node.js 24, JavaScript ES modules, TypeScript tests with Vitest, GitHub Actions, GitHub CLI.

## Global Constraints

- Preserve the dirty and divergent primary checkout; use only isolated worktrees.
- Contextual policy 4 requires `contextual-review-v7` and `contextual-assessment-v2`.
- Contextual policies 3 and 4 require the existing demonstrated-risk validation; policies 1 and 2 remain legacy.
- Never merge through a red required check or manually close an active synthesis fallback.
- Use repository workflows for generated project branches and issue state transitions.

---

### Task 1: Accept contextual-review policy 4

**Files:**
- Modify: `tests/unit/tavernkeeper-reports.test.ts`
- Modify: `scripts/security/tavernkeeper-reports.mjs`

**Interfaces:**
- Consumes: TavernKeeper report/index fields `contextual_review_policy_version`, `prompt_version`, `assessment_schema_version`, and `risk_exposure`.
- Produces: `validateReportIndex()` and `validateScanReport()` acceptance of valid policy-4 artifacts without weakening legacy validation.

- [ ] **Step 1: Add a valid policy-4 fixture helper and failing acceptance test**

Add a `policy4ExposureReport()` helper that derives from `policy3ExposureReport()`, sets policy `4`, prompt `contextual-review-v7`, schema `contextual-assessment-v2`, and rebinds the immutable digest. Assert that both index and report validation return the policy-4 artifact.

- [ ] **Step 2: Run the focused test and verify red**

Run:

```powershell
npm.cmd test -- tests/unit/tavernkeeper-reports.test.ts -t "accepts policy-4 demonstrated-risk reports"
```

Expected: failure with `TavernKeeper has an unsupported contextual review policy version`.

- [ ] **Step 3: Implement the minimal version-bound validator**

In `scripts/security/tavernkeeper-reports.mjs`:

```js
const supportedContextualReviewPolicyVersions = new Set(["1", "2", "3", "4"]);

function contextualReviewPromptVersion(policyVersion) {
  return policyVersion === "4" ? "contextual-review-v7" : "contextual-review-v6";
}
```

Treat policies 3 and 4 as demonstrated-risk policies, require the version-specific prompt plus schema v2, reuse the existing risk computation, and retain the legacy branch for policies 1 and 2.

- [ ] **Step 4: Run the focused test and verify green**

Run the command from Step 2. Expected: pass.

- [ ] **Step 5: Add one stale-contract regression**

Clone a valid policy-4 report, replace its prompt with `contextual-review-v6`, rebind its digest, and assert `validateScanReport()` throws a policy-4 contract-version error.

- [ ] **Step 6: Verify the full reader suite**

```powershell
npm.cmd test -- tests/unit/tavernkeeper-reports.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Run repository verification**

```powershell
npm.cmd run check
```

Expected: formatting, lint, generated catalog/report validation, typecheck, tests, static build, and export verification all pass.

- [ ] **Step 8: Commit**

```powershell
git add scripts/security/tavernkeeper-reports.mjs tests/unit/tavernkeeper-reports.test.ts
git commit -m "fix(security): accept contextual policy v4"
```

### Task 2: Publish and merge the policy-4 reader

**Files:**
- Existing committed design and implementation changes on `codex/resolve-outstanding-github-20260810`.

**Interfaces:**
- Produces: a focused GitHub PR whose merge restores the reconciliation reader.

- [ ] **Step 1: Push the isolated branch**

```powershell
git push origin codex/resolve-outstanding-github-20260810
```

- [ ] **Step 2: Open a ready PR**

Create a PR titled `Accept TavernKeeper contextual-review policy v4` with the root cause and verification evidence.

- [ ] **Step 3: Wait for required checks and merge**

Use `gh pr checks --watch`; merge only when verify and visual checks are green.

### Task 3: Restore reconciliation and resolve #460

**Files:** None; workflow-owned state only.

**Interfaces:**
- Consumes: merged reader, report digest `11f7bea761dfa400588c9c2d89ce40e6ae8949111f86f510056b54dccf5afdc5`.
- Produces: successful reconciliation and automated incident closure when narrative synthesis succeeds.

- [ ] **Step 1: Dispatch an ordinary reconciliation**

```powershell
gh workflow run import-tavernkeeper-reports.yml --ref main
```

Confirm the unsupported-policy error is absent.

- [ ] **Step 2: Dispatch the exact fallback retry**

```powershell
gh workflow run import-tavernkeeper-reports.yml --ref main -f retry_report_digest=11f7bea761dfa400588c9c2d89ce40e6ae8949111f86f510056b54dccf5afdc5
```

Wait for completion and inspect issue #460. If the same provider fallback recurs, retain the issue with its automation-owned updated diagnostic.

### Task 4: Release PR #459 and resolve #419

**Files:** Existing PR #459 branch and workflow-owned generated submission branch.

**Interfaces:**
- Produces: utility-first structured output in `main`, one-shot Luna repair for invalid JSON, and a valid project submission for issue #419.

- [ ] **Step 1: Synchronize PR #459 with current main**

In its existing isolated worktree, fetch and merge `origin/main` into `codex/utility-json-repair`. Resolve only genuine source conflicts; retain current main's visual stabilization unchanged.

- [ ] **Step 2: Run local verification and push**

Run `npm.cmd run catalog:build` followed by `npm.cmd run check`, then push the branch.

- [ ] **Step 3: Mark ready, wait for checks, and merge**

Remove draft status only after the local suite passes. Merge only when required checks are green.

- [ ] **Step 4: Retry issue #419**

```powershell
gh workflow run generate-project-submission.yml --ref main -f issue_number=419 -f force_regeneration=false
```

Wait for the generated review PR, inspect its catalog record and checks, then merge when green. Confirm the publication workflow closes #419.

### Task 5: Final deployed-state audit

**Files:** None; read-only verification.

**Interfaces:**
- Produces: exact final issue/PR/run inventory and deployed catalog evidence.

- [ ] **Step 1: Verify GitHub inventory**

List all open issues and PRs. Any remaining item must have a current, explicit blocker rather than stale state.

- [ ] **Step 2: Verify exact deployment**

Confirm the latest successful Pages deployment uses the final publication SHA and the hydrated catalog contains the `zeroxjason-sillytavern-chatrenamer` project exactly once.
