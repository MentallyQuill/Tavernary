# TavernKeeper Review Protocol 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore TavernKeeper reconciliation by accepting valid policy-5 review protocol 2 aggregate accounting.

**Architecture:** Extend Tavernary's strict copy of the TavernKeeper v5 contract with the exact protocol marker. Keep every existing accounting invariant, but condition the five per-wave cap comparisons on the absence of protocol 2.

**Tech Stack:** Node.js 24, JavaScript modules, JSON Schema with Ajv, TypeScript declarations, Vitest

## Global Constraints

- Preserve strict schema validation and reject unknown properties or protocol versions.
- Preserve compatibility with immutable policy-5 reports that omit the marker.
- Do not change wake/retry scheduling or TavernKeeper producer behavior.

---

### Task 1: Add protocol-2 regression coverage

**Files:**
- Modify: `tests/unit/tavernkeeper-reports.test.ts`

**Interfaces:**
- Consumes: `validateScanReport(report, entry)` and the policy-5 fixture.
- Produces: A regression proving consistent protocol-2 aggregate totals are accepted.

- [ ] **Step 1: Construct a protocol-2 policy-5 report in the unit test**

Create 13 contextual candidates and assessments, seven reconciled review
batches, aggregate token usage above the configured caps, and
`review_protocol_version: 2`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- --run tests/unit/tavernkeeper-reports.test.ts`

Expected: FAIL with `review_triage/model_budget must NOT have additional properties`.

### Task 2: Accept the exact protocol-2 contract

**Files:**
- Modify: `data/schemas/tavernkeeper-scan-report.v5.schema.json`
- Modify: `scripts/security/tavernkeeper-reports.mjs`
- Modify: `scripts/security/tavernkeeper-reports.d.mts`

**Interfaces:**
- Consumes: `review_triage.model_budget.review_protocol_version`.
- Produces: Strict schema/type support and protocol-aware cap validation.

- [ ] **Step 1: Add the optional literal marker to schema and declarations**

Add `review_protocol_version` with JSON Schema `const: 2` and TypeScript type
`review_protocol_version?: 2`.

- [ ] **Step 2: Condition only cap comparisons on protocol 2**

Keep equality/accounting checks unconditional. Wrap the five `actual >
configured` comparisons in
`triage.model_budget.review_protocol_version !== 2 && (...)`.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run: `npm.cmd test -- --run tests/unit/tavernkeeper-reports.test.ts`

Expected: 76 tests pass with zero failures.

### Task 3: Verify and publish

**Files:**
- Verify all files changed by Tasks 1 and 2.

**Interfaces:**
- Consumes: The completed compatibility patch.
- Produces: A reviewed pull request and live successful reconciliation.

- [ ] **Step 1: Run repository checks**

Run `npm.cmd run check` and confirm every command exits zero.

- [ ] **Step 2: Review the complete diff**

Confirm the patch changes no retry scheduling and retains all non-cap
invariants.

- [ ] **Step 3: Commit and publish**

Commit as `fix(security): accept review protocol 2`, push the feature branch,
and open a pull request against `main`.

- [ ] **Step 4: Verify GitHub and live behavior**

Wait for required PR checks, merge the pull request, dispatch reconciliation,
and verify the import job, summary publication if changed, and applicable Pages
deployment complete successfully.
