# Project Submission Label Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure future generated project-submission PR closures remove obsolete lifecycle labels while preserving unrelated issue labels.

**Architecture:** Keep the existing lifecycle planner and label-set calculation. Change only the GitHub API mutation from additive label application to full replacement using the already-computed label set.

**Tech Stack:** GitHub Actions, GitHub REST API, Vitest, TypeScript

## Global Constraints

- Do not modify or backfill existing GitHub issues.
- Preserve all labels except those explicitly listed in `removeLabels`.
- Keep the current merged and declined lifecycle behavior unchanged.

---

### Task 1: Use Replacement Semantics for Lifecycle Labels

**Files:**
- Modify: `.github/workflows/project-submission-lifecycle.yml`
- Test: `tests/unit/workflows.test.ts`

**Interfaces:**
- Consumes: `plan.removeLabels` and `plan.addLabels` from `planProjectSubmissionClosure()`
- Produces: A complete issue-label set sent through GitHub's replace-labels endpoint

- [ ] **Step 1: Write the failing test**

Add assertions to the lifecycle workflow test requiring `gh api --method PUT` and rejecting additive `POST` label synchronization.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/unit/workflows.test.ts`

Expected: FAIL because the workflow currently uses `POST`.

- [ ] **Step 3: Write the minimal implementation**

Change the lifecycle issue-label API request from `POST` to `PUT`.

- [ ] **Step 4: Run focused and related tests**

Run: `npm test -- tests/unit/workflows.test.ts tests/unit/project-submission-lifecycle.test.ts`

Expected: PASS.

- [ ] **Step 5: Run static verification and inspect the diff**

Run: `npm run typecheck`

Run: `git diff --check`

Expected: Both commands exit successfully.
