# Project Generation Failure Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project-generation failures actionable and recoverable while preserving strict automatic-copy validation and allowing only verified manual owner copy to degrade safely to maintainer review.

**Architecture:** Keep provider validation fail-closed for automatic metadata. Add an explicit degraded manual-owner-copy result at the copy-preservation boundary, carry that result through owner generation and publication transactions, and centralize terminal workflow reconciliation in one tested script used by both generation workflows. Keep owner metadata modes controlled only by explicit policy inputs in the builder.

**Tech Stack:** TypeScript, React, Node.js 24 ESM, Vitest, GitHub Actions YAML, GitHub REST API.

## Global Constraints

- Keep strict provider-output validation and one bounded repair attempt.
- Never invent, zero-fill, or silently accept invalid automatic metadata.
- Safe degradation applies only to verified repository-owner or Tavernary-staff manual summary copy.
- Degraded copy must retain the submitted summary exactly and require manual publication approval.
- Failure comments and reports must contain sanitized reason categories only.
- Exact path, source identity, fingerprint, branch ownership, and exact-head guards remain unchanged.

---

### Task 1: Preserve Explicit Owner Metadata Intent

**Files:**
- Modify: `src/features/help/components/project-owner-builder.tsx`
- Test: `tests/unit/project-owner-builder.test.tsx`

**Interfaces:**
- Consumes: existing owner-card draft state and explicit summary/tag policy controls.
- Produces: owner manifests whose metadata modes change only when the corresponding policy control changes.

- [ ] **Step 1: Write one failing builder test**

Add a test that edits summary text on an automatic card and asserts the submitted manifest still has `proposed.metadata.summary.mode === "automatic"`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/unit/project-owner-builder.test.tsx`

Expected: the new assertion fails because editing text currently selects manual summary policy.

- [ ] **Step 3: Implement the minimal summary-policy fix**

Remove the implicit metadata-mode mutation from the summary edit handler while preserving the edited text as proposal context.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/unit/project-owner-builder.test.tsx`

- [ ] **Step 5: Repeat RED/GREEN for tag edits and navigation persistence**

Add one test at a time for automatic tag edits, explicit manual choices, and review/back/edit persistence; make only the minimal handler/state changes needed for each test.

---

### Task 2: Add Safe Manual Owner Copy Degradation

**Files:**
- Modify: `scripts/catalog/catalog-copy-provider.mjs`
- Modify: `scripts/catalog/catalog-copy-preservation.mjs`
- Modify: `scripts/catalog/catalog-copy-preservation.d.mts`
- Modify: `scripts/help/generate-project-owner-request.mjs`
- Modify: `scripts/help/generate-project-owner-request.d.mts`
- Modify: `scripts/publication/project-publication-transaction.mjs`
- Modify: `scripts/publication/project-publication-transaction.d.mts`
- Modify: `scripts/publication/project-publication-planner.mjs`
- Test: `tests/unit/catalog-copy-provider.test.ts`
- Test: `tests/unit/catalog-copy-preservation.test.ts`
- Test: `tests/unit/generate-project-owner-request.test.ts`
- Test: `tests/unit/project-publication-transaction.test.ts`
- Test: `tests/unit/project-publication-planner.test.ts`

**Interfaces:**
- Produces: `preserveCatalogSummary()` result discriminated by `reviewStatus: "validated" | "unavailable"`.
- Produces: degraded owner generation report data with `reason_code: "copy-review-unavailable"` and no fabricated copy result.
- Produces: `publication_mode: "manual"` for degraded transactions.

- [ ] **Step 1: Write a failing provider-prompt test**

Assert that both initial and repair prompts enumerate the exact result keys and allowed `result` values in plain language.

- [ ] **Step 2: Verify RED, implement the prompt text, and verify GREEN**

Run: `npm test -- tests/unit/catalog-copy-provider.test.ts`

- [ ] **Step 3: Write a failing preservation fallback test**

For verified owner manual copy, return two invalid provider outputs and assert the result preserves submitted text with `reviewStatus: "unavailable"`, `reasonCode: "copy-review-unavailable"`, and no `copyResult`.

- [ ] **Step 4: Verify RED, implement the discriminated fallback, and verify GREEN**

Run: `npm test -- tests/unit/catalog-copy-preservation.test.ts`

Keep automatic/community call sites throwing; do not broaden the fallback boundary.

- [ ] **Step 5: Write and satisfy owner-generation propagation tests**

One test at a time, assert degraded copy is reported without fabricated validation data, preserves exact owner text, and produces a manual publication transaction.

Run: `npm test -- tests/unit/generate-project-owner-request.test.ts`

- [ ] **Step 6: Write and satisfy publication safety tests**

Assert degraded/manual transactions require maintainer approval and cannot validate as automatic transactions.

Run: `npm test -- tests/unit/project-publication-transaction.test.ts tests/unit/project-publication-planner.test.ts`

---

### Task 3: Reconcile Terminal Generation Failures

**Files:**
- Create: `scripts/submissions/project-generation-failure.mjs`
- Create: `scripts/submissions/project-generation-failure.d.mts`
- Modify: `.github/workflows/generate-project-owner-request.yml`
- Modify: `.github/workflows/generate-project-submission.yml`
- Test: `tests/unit/project-generation-failure.test.ts`
- Test: `tests/unit/workflow-contracts.test.ts`

**Interfaces:**
- Produces: `planProjectGenerationFailure(input)` returning a no-op or exact desired labels/comment for current issue/PR state.
- Produces: a CLI that reads current issue and owned PR state, applies the plan idempotently, and updates one marker comment.

- [ ] **Step 1: Write a failing planner test for failure without a PR**

Assert an open admitted issue moves from `needs-maintainer-review` to `submission-retryable`, preserves unrelated labels, and receives one sanitized marker comment.

- [ ] **Step 2: Verify RED, implement the pure planner, and verify GREEN**

Run: `npm test -- tests/unit/project-generation-failure.test.ts`

- [ ] **Step 3: Add one RED/GREEN case at a time**

Cover owned PR preservation as `submission-pr-open`, idempotent comment updates, closed/declined/needs-information no-ops, cancelled runs, and newer successful state protection.

- [ ] **Step 4: Add the GitHub API application layer**

Implement exact current-state reads, owned-marker validation, atomic label synchronization, and create-or-update marker comments without logging raw provider/source text.

- [ ] **Step 5: Add failing workflow-contract assertions**

Assert both generation workflows invoke the reconciliation CLI in an always-run non-cancelled failure step with issue number, producer, branch, run URL, and sanitized category.

- [ ] **Step 6: Wire both workflows and verify GREEN**

Run: `npm test -- tests/unit/project-generation-failure.test.ts tests/unit/workflow-contracts.test.ts`

---

### Task 4: Verify, Publish, and Recover Issues 165-167

**Files:**
- Verify all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: deployed `main` workflows and the three admitted GitHub issues.
- Produces: accurate issue labels/comments and generated review PRs where content validation permits.

- [ ] **Step 1: Run focused validation**

Run all tests touched in Tasks 1-3, then `npm run typecheck`, `npm run lint`, and `npm run format:check`.

- [ ] **Step 2: Run the full repository gate**

Run: `npm run check`

- [ ] **Step 3: Review the final diff and commit**

Confirm only approved recovery behavior, tests, workflows, and this plan changed; commit with a narrow message.

- [ ] **Step 4: Push and create the review PR**

Push `codex/project-generation-failure-recovery`, create a ready PR, and monitor every required workflow for the exact head SHA.

- [ ] **Step 5: Merge after green checks**

Merge only after required checks pass, then monitor workflows for the resulting `main` SHA.

- [ ] **Step 6: Recover issue 165**

Dispatch `generate-project-submission.yml` for issue 165 and verify the fixed Reddit name, exact generated branch, PR, and issue state.

- [ ] **Step 7: Recover issue 166**

Dispatch `generate-project-owner-request.yml` for issue 166 and verify either validated automatic publication or the explicit manual-review fallback PR.

- [ ] **Step 8: Recover issue 167**

Dispatch `generate-project-submission.yml` for issue 167. Verify a valid PR is created or, if automatic provider output remains invalid, the issue becomes `submission-retryable` with one sanitized failure comment and no partial branch.

- [ ] **Step 9: Verify lifecycle and live publication**

For any merged generated PR, monitor publication, deployment, and live catalog HTTP/card state. Report local, remote, and live evidence separately.
