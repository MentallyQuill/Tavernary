# Manual Issue Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development while executing this plan.

**Goal:** Add a safe manual recovery dispatch to issue admission.

**Architecture:** The workflow supplies an issue number. The admission script resolves a complete live issue payload through its existing GitHub API boundary, then feeds the unchanged admission and routing policy.

**Tech Stack:** GitHub Actions YAML, Node.js 24, Vitest, TypeScript tests.

## Global Constraints

- Do not bypass admission policy or manually grant `issue-admitted`.
- Preserve issue-event behavior.
- Run only focused tests plus formatting for changed files.

---

### Task 1: Manual event resolution

**Files:**
- Modify: `tests/unit/admit-issue.test.ts`
- Modify: `scripts/submissions/admit-issue.mjs`

- [ ] Add failing tests for resolving a dispatch input into a live issue event and rejecting invalid numbers/PRs.
- [ ] Run the focused admission test and confirm the expected failures.
- [ ] Implement the minimal resolver and route CLI execution through it.
- [ ] Re-run the focused admission test.

### Task 2: Workflow contract

**Files:**
- Modify: `tests/unit/workflows.test.ts`
- Modify: `.github/workflows/admit-issue.yml`

- [ ] Add a failing workflow-contract test for the manual input and event/input fallback expressions.
- [ ] Run the focused workflow test and confirm the expected failure.
- [ ] Add `workflow_dispatch` and wire the issue number through run naming, concurrency, and the admission step.
- [ ] Run both focused test files and formatting checks for changed files.
