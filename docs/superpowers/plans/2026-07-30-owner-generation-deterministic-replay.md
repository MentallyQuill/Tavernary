# Owner Generation Deterministic Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project-owner generation robust to stochastic metadata output by replaying one validated resolution during the final pre-mutation pass.

**Architecture:** The first pass records exact resolved metadata in its generation report. The second pass receives that trusted job-local report, revalidates all current request and registry identity fields, replays the resolution without provider calls, and retains exact report and file-hash comparison.

**Tech Stack:** Node.js 24 ESM, GitHub Actions, Vitest, TypeScript declarations.

## Global Constraints

- Preserve exact report and generated-file hash equality.
- Preserve authority, issue-refresh, fingerprint, source-identity, current-main, and exact-path checks.
- Never accept replay data from an issue or cross-run artifact.
- Never call copy or enrichment providers during replay.
- Use one red-green-refactor cycle per behavior.

---

### Task 1: Record and replay validated metadata

**Files:**
- Modify: `scripts/help/generate-project-owner-request.mjs`
- Modify: `scripts/help/generate-project-owner-request.d.mts`
- Test: `tests/unit/generate-project-owner-request.test.ts`

**Interfaces:**
- Consumes: `OwnerGenerationReport`, current triage decision, metadata candidates.
- Produces: `resolved_metadata` in reports and optional `validatedReport` generator input.

- [ ] Add a failing test in which first-pass automatic metadata differs from a hypothetical second provider result.
- [ ] Run the focused test and verify replay support is missing.
- [ ] Add `resolved_metadata` to the first-pass report.
- [ ] Validate report identity and exact candidate project IDs before replay.
- [ ] Return cloned replay resolution, copy results, and metadata results without provider calls.
- [ ] Run the focused test and verify exact report and generated project equality.
- [ ] Add one failing tamper test for a changed request fingerprint.
- [ ] Implement fail-closed stale-report rejection and rerun focused tests.

### Task 2: Wire job-local replay into the CLI and workflow

**Files:**
- Modify: `scripts/help/generate-project-owner-request.mjs`
- Modify: `scripts/help/generate-project-owner-request.d.mts`
- Modify: `.github/workflows/generate-project-owner-request.yml`
- Test: `tests/unit/generate-project-owner-request-cli.test.ts`
- Test: `tests/unit/workflows.test.ts`

**Interfaces:**
- Consumes: `--validated-report-path <runner-temp-json>`.
- Produces: `validatedReport` passed to `generateProjectOwnerRequest`.

- [ ] Add a failing CLI parser test for the optional validated-report path.
- [ ] Run the CLI test and verify the option is rejected.
- [ ] Parse and load the job-local validated report.
- [ ] Run the CLI test and verify the optional path is returned.
- [ ] Add a failing workflow assertion for the second generator invocation.
- [ ] Pass the copied validated report to only the final pre-mutation invocation.
- [ ] Run workflow tests.

### Task 3: Verify the complete guard contract

**Files:**
- Test: `tests/unit/generate-project-owner-request.test.ts`
- Test: `tests/unit/workflows.test.ts`

**Interfaces:**
- Consumes: completed deterministic replay implementation.
- Produces: verification evidence for issue #175's failure mode and existing safety checks.

- [ ] Run focused owner-generation and workflow tests.
- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd run verify:export`.
- [ ] Run Prettier checks and `git diff --check`.
- [ ] Review the final diff for unrelated user changes and exact workflow scope.
