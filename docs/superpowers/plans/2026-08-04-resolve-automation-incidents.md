# Resolve Open Automation Incidents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the three active TavernKeeper synthesis quarantines and generate the missing review PR for project submission #255 without weakening either publication boundary.

**Architecture:** Keep both workflows fail-closed. Make the deterministic TavernKeeper evidence floor explicit to the synthesis provider and its repair loop, and make catalog-copy repair explicitly paraphrase source syntax whose literal brackets are forbidden in public summaries. Reconcile each durable incident only after the merged production workflow accepts it.

**Tech Stack:** Node.js 24, ECMAScript modules, TypeScript tests with Vitest, GitHub Actions, GitHub CLI.

## Global Constraints

- TavernKeeper assessments may exceed the deterministic evidence floor only with a valid cited causal interaction chain.
- Generated project summaries remain 120-220 characters, single-line plain text, with no Markdown, list syntax, URLs, domain-style links, or emoji.
- Provider output remains untrusted and is never logged verbatim in GitHub issues.
- Existing quarantines and `submission-retryable` state remain durable until an exact successful retry resolves them.

---

### Task 1: Evidence-floor-aware TavernKeeper synthesis repair

**Files:**
- Modify: `scripts/security/tavernkeeper-assessment-contract.mjs`
- Modify: `scripts/security/tavernkeeper-assessment-contract.d.mts`
- Modify: `scripts/security/tavernkeeper-synthesis-provider.mjs`
- Test: `tests/unit/tavernkeeper-synthesis.test.ts`

**Interfaces:**
- Consumes: `deriveEvidenceFloor(reportItems(report))` and the existing strict assessment schema.
- Produces: `tavernKeeperAssessmentRequirements(report).evidence_floor` plus actionable `unsupported_escalation` repair data.

- [ ] **Step 1: Write failing contract and provider-projection tests**

Add assertions that a report with a medium-confidence material vulnerability and one `high_danger` count projects `evidence_floor: "material"`, and that an unsupported `high` result returns the rejected and required risk levels.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- tests/unit/tavernkeeper-synthesis.test.ts`

Expected: FAIL because `evidence_floor`, `rejected_risk_level`, and `required_risk_level` are absent.

- [ ] **Step 3: Implement the minimal contract and prompt change**

Return the evidence floor from `tavernKeeperAssessmentRequirements`, include it in every bounded repair, and tell the provider that `high_danger` is a count rather than the project risk grade. For `unsupported_escalation`, include the rejected grade and floor grade without copying generated prose.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- tests/unit/tavernkeeper-synthesis.test.ts`

Expected: PASS.

### Task 2: Bracketed source-syntax summary repair

**Files:**
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Test: `tests/unit/enrich-readmes.test.ts`

**Interfaces:**
- Consumes: the existing generated-summary validation errors and rejected summary supplied only to the provider repair call.
- Produces: an actionable repair message that tells the provider to paraphrase literal bracketed markers instead of reproducing them.

- [ ] **Step 1: Write a failing ComfyInject-style repair test**

Generate an invalid 120-220 character summary containing `[[IMG: prompt | AR | SHOT | SEED]]`, then return a valid paraphrase. Assert that the second provider input explicitly instructs the model to paraphrase bracketed source syntax.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- tests/unit/enrich-readmes.test.ts`

Expected: FAIL because the repair message only repeats the generic no-Markdown constraint.

- [ ] **Step 3: Implement minimal repair guidance**

When the rejected summary contains `[` or `]`, append a sanitized instruction to describe the marker or command in ordinary words and not reproduce bracket characters. Do not relax summary validation.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- tests/unit/enrich-readmes.test.ts`

Expected: PASS.

### Task 3: Verify, publish, and reconcile live incidents

Before publication, preserve a sanitized `output-invalid` reason artifact across the project-submission workflow so future failures distinguish copy validation from an unspecified generation failure without exposing provider text.

**Files:**
- Verify all modified source, type declaration, tests, and this plan.

**Interfaces:**
- Consumes: merged `main`, `import-tavernkeeper-reports.yml`, and `generate-project-submission.yml`.
- Produces: closed quarantine issues #259, #262, #265 and a generated review PR for issue #255.

- [ ] **Step 1: Run repository verification**

Run: `npm.cmd run check`

Expected: exit 0 with formatting, lint, validation, typecheck, tests, build, and static-export verification passing.

- [ ] **Step 2: Review and commit the exact diff**

Run: `git diff --check`, `git status --short`, and inspect `git diff` before committing only the planned files.

- [ ] **Step 3: Publish and integrate the fix**

Push `agent/resolve-automation-incidents`, open a focused pull request, wait for required checks, and merge only after they pass.

- [ ] **Step 4: Retry quarantined reports individually**

Dispatch `import-tavernkeeper-reports.yml` with each exact digest from issues #259, #262, and #265. Verify each run imports the report and automatically closes its matching incident.

- [ ] **Step 5: Retry project submission #255**

Dispatch `generate-project-submission.yml` for issue 255. Verify an `automation/project-submission-255` branch and review PR exist and the issue transitions from `submission-retryable` to `submission-pr-open`.

- [ ] **Step 6: Confirm final GitHub state**

List open issues and inspect the generated PR, workflow logs, labels, exact head SHA, and issue comments. Do not manually close an incident that remains present in durable state.
