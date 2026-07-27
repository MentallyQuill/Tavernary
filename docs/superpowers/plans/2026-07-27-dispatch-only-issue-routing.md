# Dispatch-Only Issue Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route issue events through one intake workflow and dispatch only the matching Project, Kit, or Kit-withdrawal worker.

**Architecture:** Extend admission output with a label-derived route and make edits route-only. Convert the three worker workflows to `workflow_dispatch` only; withdrawal re-fetches its live issue from the dispatched issue number.

**Tech Stack:** Node.js 24, JavaScript ES modules, TypeScript declarations, GitHub Actions YAML, Vitest 4, PowerShell/npm.cmd

## Global Constraints

- Structured issue labels are the only routing authority.
- Titles do not route automation.
- Opened and reopened issues run admission before routing.
- Edited issues preserve current admission state.
- Workers re-fetch live issue state before mutation.
- Manual worker dispatch remains available.
- Preserve unrelated worktree changes.

---

### Task 1: Add route-aware admission output

**Files:**
- Modify: `tests/unit/admit-issue.test.ts`
- Modify: `scripts/submissions/admit-issue.mjs`
- Modify: `scripts/submissions/admit-issue.d.mts`

**Interfaces:**
- Produces: `issueRouteFromLabels(labels): "project" | "kit" | "kit-withdrawal" | "none" | "conflict"`
- Produces: `issueAdmissionOutputs(...).route`
- Produces: route-only decisions for edited issues from current state and labels

- [ ] Write failing tests for string/object labels, every route, conflicts, and edited issue admission preservation.
- [ ] Run `npm.cmd test -- tests/unit/admit-issue.test.ts` and confirm failure because route output and edited handling do not exist.
- [ ] Implement the classifier and route-only edited decision.
- [ ] Extend declaration types with the exact route union and edited action.
- [ ] Run the focused test and confirm it passes.

### Task 2: Make workers dispatch-only

**Files:**
- Modify: `tests/unit/workflows.test.ts`
- Modify: `.github/workflows/admit-issue.yml`
- Modify: `.github/workflows/triage-submission.yml`
- Modify: `.github/workflows/triage-kit-submission.yml`
- Modify: `.github/workflows/apply-kit-withdrawal.yml`

**Interfaces:**
- Consumes: `steps.admission.outputs.route`
- Dispatches: each worker with `issue_number`

- [ ] Write failing workflow assertions that intake owns `opened`, `reopened`, and `edited`, while all three workers expose only `workflow_dispatch`.
- [ ] Assert intake dispatches Project validation, Kit validation, and Kit withdrawal by exact route and contains no title-prefix routing.
- [ ] Run `npm.cmd test -- tests/unit/workflows.test.ts` and confirm failure on current broad worker triggers.
- [ ] Update intake triggers and route conditions.
- [ ] Remove issue-event triggers and job-level event guards from all three workers.
- [ ] Add the numeric `issue_number` withdrawal input and environment.
- [ ] Run focused workflow tests and confirm they pass.

### Task 3: Re-fetch withdrawal issues

**Files:**
- Modify: `tests/unit/apply-kit-withdrawal.test.ts`
- Modify: `scripts/kits/apply-withdrawal.mjs`

**Interfaces:**
- Consumes: `ISSUE_NUMBER`, `GITHUB_REPOSITORY`, and `GITHUB_TOKEN`
- Fetches: `/repos/{repository}/issues/{issue_number}`
- Preserves: numeric author validation and withdrawal tombstone behavior

- [ ] Write a failing CLI test proving workflow-dispatch payloads fetch the live issue by number.
- [ ] Run `npm.cmd test -- tests/unit/apply-kit-withdrawal.test.ts` and confirm failure because the script expects an issue event payload.
- [ ] Implement live issue fetch and structured-label validation.
- [ ] Run the focused withdrawal test and confirm it passes.

### Task 4: Verify the complete repair

**Files:**
- Verify all files changed by Tasks 1-3.

- [ ] Run `npm.cmd test -- tests/unit/admit-issue.test.ts tests/unit/workflows.test.ts tests/unit/apply-kit-withdrawal.test.ts`.
- [ ] Run `npm.cmd run check`.
- [ ] Run `git diff --check`.
- [ ] Inspect `git diff` and `git status --short` for scoped changes only.
