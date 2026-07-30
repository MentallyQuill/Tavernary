# Project Submission Metadata Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let valid project submissions recover from two consecutive provider validation failures while preserving Tavernary's strict catalog metadata contracts.

**Architecture:** Keep validation authoritative and wrap only the existing source-backed generate-and-validate sequence in a bounded loop. The initial provider call may be followed by at most two deterministic validation-repair calls, each built from the latest rejected output; the existing tag-only fallback and terminal `output-invalid` behavior remain after the loop.

**Tech Stack:** Node.js ESM, TypeScript tests, Vitest, GitHub Actions

## Global Constraints

- Make at most three provider calls: one initial call and two validation-repair calls.
- Build every repair request from the immediately preceding output and its deduplicated validation errors.
- Do not truncate or synthesize invalid metadata, weaken validation, or retry non-validation failures.
- Preserve manual metadata policy, confirmed no-README fallback, and the existing valid-summary/empty-tags fallback.
- Change only the enrichment implementation, its focused unit tests, and task documentation.

---

### Task 1: Prove bounded recovery and exhaustion behavior

**Files:**
- Modify: `tests/unit/enrich-readmes.test.ts`

**Interfaces:**
- Consumes: `enrichRecord(...)`, a provider double returning a controlled sequence of complete provider responses
- Produces: observable success or `output-invalid`, exact provider call count, and repair payloads derived from the latest invalid response

- [x] **Step 1: Add a recovery regression test**
  - Return an overlong initial summary with an initial evidence error.
  - Return a distinct invalid first-repair summary with a different evidence error.
  - Return a valid response on the second repair.
  - Assert the real `enrichRecord` result is valid and the provider was called exactly three times.
  - Assert repair call two contains the initial rejected summary and errors.
  - Assert repair call three contains the first repair's rejected summary and errors, not stale initial diagnostics.
  - Mutation caught: restoring the one-repair branch or reusing the initial diagnostics makes this test fail.

- [x] **Step 2: Add an exhaustion regression test**
  - Return three distinct invalid responses.
  - Assert `enrichRecord` rejects with `code: "output-invalid"`.
  - Assert no fourth provider call occurs.
  - Mutation caught: unbounded retries, silent acceptance, or fallback from an invalid summary makes this test fail.

- [x] **Step 3: Run `npm.cmd test -- tests/unit/enrich-readmes.test.ts` and verify RED**
  - Expected failure: the recovery test throws after the current second provider call.
  - Confirm the failure is behavioral, not fixture or syntax failure.

### Task 2: Implement the bounded validation-repair loop

**Files:**
- Modify: `scripts/catalog/enrich-readmes.mjs`

**Interfaces:**
- Consumes: the existing provider input, provider response, and `validateEnrichmentOutput(...)`
- Produces: a valid provider output, existing valid tag fallback, or terminal `output-invalid`

- [x] **Step 1: Centralize request-scoped validation**
  - Add a local validation function inside `enrichRecord` using the unchanged requested fields, project kind, vocabulary, synthesize mode, and protected terms.
  - Use it for initial, repaired, and tag-fallback outputs so all paths enforce the same contract.

- [x] **Step 2: Replace the single repair branch with a two-attempt loop**
  - Make the initial provider call unchanged.
  - While validation is invalid and fewer than two repairs have run, call the provider with the original input plus the existing `repair` object.
  - Deduplicate the latest validation errors for `repair.message`.
  - Include only the latest rejected summary, capped at the existing 1,000-character diagnostic limit.
  - Revalidate the complete latest output after every repair and stop immediately on success.

- [x] **Step 3: Preserve strict post-loop behavior**
  - Run the existing tags-empty fallback only after repair exhaustion.
  - Return it only when the full response then validates.
  - Otherwise throw the latest deduplicated errors with `code: "output-invalid"`.

- [x] **Step 4: Rerun `npm.cmd test -- tests/unit/enrich-readmes.test.ts` and verify GREEN**
  - Confirm the new recovery and exhaustion tests pass.
  - Confirm the existing one-repair and tags-empty fallback tests still pass.

### Task 3: Verify repository behavior and review the patch

**Files:**
- Verify: `scripts/catalog/enrich-readmes.mjs`
- Verify: `tests/unit/enrich-readmes.test.ts`
- Verify: task documentation

**Interfaces:**
- Consumes: the completed bounded repair implementation
- Produces: repository-wide evidence that formatting, linting, types, tests, builds, schemas, and static export remain valid

- [x] **Step 1: Run adjacent focused workflow tests**
  - Run `npm.cmd test -- tests/unit/enrich-readmes.test.ts tests/unit/generate-project-submission.test.ts tests/unit/generate-project-submission-cli.test.ts`.

- [x] **Step 2: Run the full gate**
  - Run `npm.cmd run check`.

- [x] **Step 3: Inspect the final diff**
  - Run `git diff --check`.
  - Confirm the patch matches the approved design and contains no unrelated changes.
  - Perform a mutation check for one repair only, stale diagnostics, a fourth call, skipped validation, and invalid-summary fallback.

### Task 4: Release and resolve issue #151 through automation

**Files:**
- Commit: implementation, tests, design, and plan
- Verify remotely: GitHub Actions, generated submission PR, registry publication, GitHub Pages, and the live catalog

**Interfaces:**
- Consumes: the verified local commits and issue `#151`
- Produces: an exact-SHA deployment plus a catalog submission handled by the official workflow

- [x] **Step 1: Commit and push the narrow fix**
  - Confirm local `main` is based on current remote `main`.
  - Commit with a concise Conventional Commit message.
  - Push only the task commits to `origin/main`.

- [x] **Step 2: Monitor the exact pushed SHA**
  - Inspect every workflow associated with the SHA.
  - Require all relevant checks and the Pages deployment to succeed before redispatching the issue.

- [x] **Step 3: Redispatch issue #151**
  - Run `generate-project-submission.yml` on `main` with `issue_number=151`.
  - Wait for completion and inspect logs if it fails.
  - If all three outputs remain invalid, stop and report the workflow evidence without bypassing validation.

- [x] **Step 4: Audit the generated submission transaction**
  - Inspect the generated branch and pull request.
  - Verify changed files, catalog copy, tags, fork relationship, checks, and automation labels.
  - Follow the repository's official publication path; do not manually edit generated metadata or prematurely close the issue.

- [x] **Step 5: Verify publication and live deployment**
  - Confirm the publication commit and its workflows.
  - Confirm issue #151's final state and expected labels/comments.
  - Verify the live catalog exposes the new project card with its published metadata.

### Task 5: Repair blockers discovered by the generated transaction

**Files:**
- Modify: `tests/unit/full-catalog-data.test.ts`
- Modify: `tests/fixtures/github/license-cases.json`
- Modify: `tests/unit/license.test.ts`
- Modify: `src/lib/github/license.ts`

**Interfaces:**
- Consumes: a growing schema-v6 catalog and canonical root-license text
- Produces: catalog tests that preserve the migration baseline without rejecting additions, plus correct `Unlicense` classification

- [x] **Step 1: Add an Unlicense regression test and verify RED**
  - Classify canonical Unlicense text from a root `LICENSE` file.
  - Expect `osi-approved`, SPDX ID `Unlicense`, and the original source path.

- [x] **Step 2: Recognize the canonical Unlicense text and verify GREEN**
  - Add the narrow canonical text signature to the existing recognized-license table.
  - Do not infer license status from README or package metadata.

- [x] **Step 3: Make catalog baseline assertions growth-safe**
  - Preserve the schema-v6 migration report as the exact 309-project audit anchor.
  - Change live catalog totals, kind/source distributions, total tag assignments, and public build count from exact snapshots to minimum baselines.
  - Keep zero-tag and manual-tag guardrails strict so new low-quality records still fail.

- [x] **Step 4: Run focused and full verification**
  - Run the license and full-catalog tests.
  - Run `npm.cmd run check`.
  - Inspect the diff and commit only these discovered blocker repairs.

- [x] **Step 5: Reconcile and retry**
  - Push and deploy the blocker repairs.
  - Redispatch issue #151 so its generated snapshot uses the corrected license.
  - Refresh or otherwise reconcile the already-published upstream snapshot through the repository's official automation.
  - Require the regenerated PR's content checks and publication transaction to succeed.
