# Copy-Review Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve safe copy-review failure diagnostics in generation artifacts and public Actions summaries while directly testing first-pass and repaired-success preservation.

**Architecture:** A focused catalog-copy diagnostic module owns the allowlists, error sanitization, validation, and Markdown rendering. `preserveCatalogSummary` attaches either a validated `null` diagnostic or a terminal fallback diagnostic; the project-submission and owner-request generators propagate it only into their audit reports. Both workflows call the shared renderer after generation, while catalog records, issue comments, pull-request prose, and publication markers remain unchanged.

**Tech Stack:** Node.js ESM (`.mjs` plus `.d.mts` declarations), TypeScript, Vitest, YAML GitHub Actions, Prettier, ESLint.

## Global Constraints

- Actions summaries are public output and may contain only fixed labels, allowlisted codes, attempt counts, and validated latency values.
- Never record raw provider messages, outputs, prompts, credentials, repository evidence, or submitted summary text in diagnostics.
- Keep issue comments and pull-request wording generic.
- Keep existing report schema versions and publication transaction markers unchanged.
- Do not change retry counts, authority rules, copy validation, or publication policy.
- Preserve the verified owner/staff-only manual fallback and fail-closed automatic/community behavior.
- Existing reports without the optional diagnostic fields must remain valid.
- Use one red-green-refactor cycle for each behavior; do not write production code before its failing test.

## File Structure

- Create `scripts/catalog/catalog-copy-diagnostic.mjs`: allowlists, diagnostic constructors, validation, and safe Actions-summary renderer.
- Create `scripts/catalog/catalog-copy-diagnostic.d.mts`: public diagnostic types and function signatures.
- Modify `scripts/catalog/catalog-copy-preservation.mjs`: attach terminal diagnostics at the three fallback points and `null` on validated results.
- Modify `scripts/catalog/catalog-copy-preservation.d.mts`: expose the diagnostic field on both preservation result variants.
- Modify `scripts/submissions/generate-project-submission.mjs`: propagate the diagnostic through the draft into `copy_review_diagnostic`.
- Modify `scripts/submissions/generate-project-submission.d.mts`: declare report and draft diagnostic fields.
- Modify `scripts/help/generate-project-owner-request.mjs`: add the diagnostic to affected `copy_results[]` entries.
- Modify `scripts/help/generate-project-owner-request.d.mts`: declare the optional owner copy diagnostic.
- Modify `.github/workflows/generate-project-submission.yml`: append the safe submission diagnostic summary after generation.
- Modify `.github/workflows/generate-project-owner-request.yml`: append safe owner diagnostics after generation.
- Modify `tests/unit/catalog-copy-preservation.test.ts`: direct first-pass, repaired-success, and terminal diagnostic coverage.
- Create `tests/unit/catalog-copy-diagnostic.test.ts`: sanitizer and public renderer leakage coverage.
- Modify `tests/unit/generate-project-submission-cli.test.ts` and `tests/unit/generate-project-submission.test.ts`: submission propagation coverage.
- Modify `tests/unit/generate-project-owner-request.test.ts`: owner report propagation coverage.
- Modify `tests/unit/project-submission-pr.test.ts` and `tests/unit/project-owner-pr.test.ts`: prove diagnostics do not enter PR prose.
- Modify `tests/unit/workflows.test.ts`: prove both workflows use the shared safe renderer.

---

### Task 1: Safe diagnostic value and renderer

**Files:**
- Create: `scripts/catalog/catalog-copy-diagnostic.mjs`
- Create: `scripts/catalog/catalog-copy-diagnostic.d.mts`
- Create: `tests/unit/catalog-copy-diagnostic.test.ts`

**Interfaces:**
- Consumes: controlled provider errors shaped as `{ code?: unknown, diagnosticCode?: unknown, latencyMs?: unknown }`.
- Produces: `CopyReviewDiagnostic`, `providerCopyReviewDiagnostic(error, failurePhase, attemptCount)`, `invalidOutputCopyReviewDiagnostic()`, `normalizeCopyReviewDiagnostic(value)`, and `renderCopyReviewDiagnosticSummary(values)`.

- [ ] **Step 1: Write the failing renderer test**

Create `tests/unit/catalog-copy-diagnostic.test.ts` with a test that imports the wished-for API and verifies fixed public output:

```ts
import { expect, test } from "vitest";

import {
  renderCopyReviewDiagnosticSummary,
} from "../../scripts/catalog/catalog-copy-diagnostic.mjs";

test("renders only allowlisted copy-review diagnostics", () => {
  const summary = renderCopyReviewDiagnosticSummary([
    {
      failure_phase: "initial-provider",
      failure_code: "provider-timeout",
      diagnostic_code: null,
      attempt_count: 1,
      latency_ms: 1250,
    },
  ]);

  expect(summary).toContain("Catalog-copy review diagnostic");
  expect(summary).toContain("Initial provider call");
  expect(summary).toContain("Provider timeout");
  expect(summary).toContain("1,250 ms");
});
```

- [ ] **Step 2: Run the renderer test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/catalog-copy-diagnostic.test.ts
```

Expected: FAIL because `catalog-copy-diagnostic.mjs` does not exist.

- [ ] **Step 3: Implement the minimal typed renderer**

Create the module and declaration with these exact public signatures:

```ts
export type CopyReviewFailurePhase =
  | "initial-provider"
  | "repair-provider"
  | "repaired-output-validation";

export type CopyReviewFailureCode =
  | import("./enrichment-provider.mjs").ProviderErrorCode
  | "provider-error"
  | "copy-output-invalid";

export type CopyReviewDiagnosticCode =
  | "tool-calls-present"
  | "content-parts-invalid"
  | "content-missing"
  | "json-invalid"
  | "json-not-object"
  | "unsupported_value:temperature";

export interface CopyReviewDiagnostic {
  failure_phase: CopyReviewFailurePhase;
  failure_code: CopyReviewFailureCode;
  diagnostic_code: CopyReviewDiagnosticCode | null;
  attempt_count: 1 | 2;
  latency_ms: number | null;
}

export function normalizeCopyReviewDiagnostic(
  value: unknown,
): CopyReviewDiagnostic | null;
export function renderCopyReviewDiagnosticSummary(
  values: readonly unknown[],
): string;
```

Use lookup objects for fixed phase/code labels. Return an empty string for an
empty input. For every non-empty entry, normalize it and render either its fixed
labels or a fixed generic unavailable row. Never interpolate a value that was
not returned by `normalizeCopyReviewDiagnostic`.

- [ ] **Step 4: Run the renderer test and verify GREEN**

Run `npm.cmd test -- tests/unit/catalog-copy-diagnostic.test.ts`.

Expected: PASS, one test.

- [ ] **Step 5: Add one failing sanitization test**

Add a test that passes an error containing both a safe provider code and secret
untrusted fields:

```ts
import {
  providerCopyReviewDiagnostic,
  renderCopyReviewDiagnosticSummary,
} from "../../scripts/catalog/catalog-copy-diagnostic.mjs";

test("sanitizes provider failures before reports or summaries", () => {
  const diagnostic = providerCopyReviewDiagnostic(
    {
      code: "provider-request-failed",
      diagnosticCode: "secret:prompt-text",
      latencyMs: 250,
      message: "do-not-publish",
    },
    "repair-provider",
    2,
  );

  expect(diagnostic).toEqual({
    failure_phase: "repair-provider",
    failure_code: "provider-request-failed",
    diagnostic_code: null,
    attempt_count: 2,
    latency_ms: 250,
  });
  expect(JSON.stringify(diagnostic)).not.toMatch(/secret|prompt|publish/iu);
  expect(renderCopyReviewDiagnosticSummary([diagnostic])).not.toMatch(
    /secret|prompt|publish/iu,
  );
});
```

- [ ] **Step 6: Run the sanitization test and verify RED**

Run `npm.cmd test -- tests/unit/catalog-copy-diagnostic.test.ts`.

Expected: FAIL because `providerCopyReviewDiagnostic` is not exported.

- [ ] **Step 7: Implement diagnostic constructors and strict normalization**

Export these signatures:

```ts
export function providerCopyReviewDiagnostic(
  error: unknown,
  failurePhase: "initial-provider" | "repair-provider",
  attemptCount: 1 | 2,
): CopyReviewDiagnostic;

export function invalidOutputCopyReviewDiagnostic(): CopyReviewDiagnostic;
```

Use explicit `Set` allowlists for provider codes and diagnostic codes. Map
unknown provider codes to `provider-error`, unknown diagnostic codes to `null`,
and non-integer, negative, or non-finite latency to `null`.
`invalidOutputCopyReviewDiagnostic()` returns
`repaired-output-validation`, `copy-output-invalid`, `null`, two attempts, and
`null` latency.

- [ ] **Step 8: Add malformed-renderer and allowed-diagnostic tests**

Add one test at a time and run it red then green:

```ts
test("renders malformed diagnostics as a fixed generic result", () => {
  const summary = renderCopyReviewDiagnosticSummary([
    { failure_code: "do-not-publish-secret" },
  ]);
  expect(summary).toContain("Copy review unavailable");
  expect(summary).not.toContain("do-not-publish-secret");
});

test("retains explicitly allowlisted provider diagnostics", () => {
  expect(
    providerCopyReviewDiagnostic(
      {
        code: "provider-response-invalid",
        diagnosticCode: "json-invalid",
        latencyMs: 20,
      },
      "initial-provider",
      1,
    ),
  ).toMatchObject({ diagnostic_code: "json-invalid", latency_ms: 20 });
});
```

- [ ] **Step 9: Format and verify Task 1**

Run:

```powershell
npx.cmd prettier --write scripts/catalog/catalog-copy-diagnostic.mjs scripts/catalog/catalog-copy-diagnostic.d.mts tests/unit/catalog-copy-diagnostic.test.ts
npm.cmd test -- tests/unit/catalog-copy-diagnostic.test.ts tests/unit/enrichment-provider.test.ts
npm.cmd run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 10: Commit Task 1**

```powershell
git add scripts/catalog/catalog-copy-diagnostic.mjs scripts/catalog/catalog-copy-diagnostic.d.mts tests/unit/catalog-copy-diagnostic.test.ts
git commit -m "feat(catalog): add safe copy diagnostics"
```

---

### Task 2: Preservation success and fallback diagnostics

**Files:**
- Modify: `scripts/catalog/catalog-copy-preservation.mjs:7-113`
- Modify: `scripts/catalog/catalog-copy-preservation.d.mts:8-38`
- Modify: `tests/unit/catalog-copy-preservation.test.ts`

**Interfaces:**
- Consumes: Task 1 diagnostic constructors and `CopyReviewDiagnostic`.
- Produces: `PreservedCatalogSummary` variants with `diagnostic: null` when validated and `diagnostic: CopyReviewDiagnostic` when unavailable.

- [ ] **Step 1: Add the first-pass success test and verify RED**

Add:

```ts
test("validates a first-pass owner summary without a failure diagnostic", async () => {
  const copySummary = vi.fn().mockResolvedValue({
    summary: "Owner wording stays exact.",
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  });

  await expect(
    preserveCatalogSummary({
      authorityType: "repository-owner",
      submittedSummary: "Owner wording stays exact.",
      copySummary,
    }),
  ).resolves.toMatchObject({
    reviewStatus: "validated",
    publishedSummary: "Owner wording stays exact.",
    diagnostic: null,
  });
  expect(copySummary).toHaveBeenCalledOnce();
});
```

Run `npm.cmd test -- tests/unit/catalog-copy-preservation.test.ts`.

Expected: FAIL because the validated result lacks `diagnostic`.

- [ ] **Step 2: Add `diagnostic: null` to validated results and verify GREEN**

Update the implementation and declaration, then rerun the focused test.

Expected: PASS.

- [ ] **Step 3: Add the repaired-success test and run it**

Add:

```ts
test("validates a repaired owner summary without a failure diagnostic", async () => {
  const copySummary = vi
    .fn()
    .mockResolvedValueOnce({ status: "accepted", summary: "" })
    .mockResolvedValueOnce({
      summary: "Owner wording stays exact.",
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    });

  const result = await preserveCatalogSummary({
    authorityType: "repository-owner",
    submittedSummary: "Owner wording stays exact.",
    copySummary,
  });

  expect(result).toMatchObject({ reviewStatus: "validated", diagnostic: null });
  expect(copySummary).toHaveBeenCalledTimes(2);
  expect(copySummary.mock.calls[1]?.[0]).toMatchObject({
    repair: { reasonCode: "output-invalid" },
  });
});
```

The behavior should already be green after Step 2; retain this test as direct
coverage and confirm that it passes for the existing repair path.

- [ ] **Step 4: Make the initial provider-failure test RED**

Change the existing transport-failure test to throw a controlled error object
and assert:

```ts
diagnostic: {
  failure_phase: "initial-provider",
  failure_code: "provider-timeout",
  diagnostic_code: null,
  attempt_count: 1,
  latency_ms: 120000,
}
```

Run `npm.cmd test -- tests/unit/catalog-copy-preservation.test.ts`.

Expected: FAIL because the unavailable result lacks the diagnostic.

- [ ] **Step 5: Attach the sanitized initial-failure diagnostic and verify GREEN**

Change the first `catch` to capture the thrown value and pass
`providerCopyReviewDiagnostic(error, "initial-provider", 1)` into the
unavailable result constructor. Rerun the test.

- [ ] **Step 6: Add repair-provider and repeated-invalid RED/GREEN cycles**

Add separate tests for:

```ts
{
  failure_phase: "repair-provider",
  failure_code: "provider-rate-limited",
  diagnostic_code: null,
  attempt_count: 2,
  latency_ms: 450,
}
```

and:

```ts
{
  failure_phase: "repaired-output-validation",
  failure_code: "copy-output-invalid",
  diagnostic_code: null,
  attempt_count: 2,
  latency_ms: null,
}
```

For each test: run it to observe the missing diagnostic failure, implement only
that fallback branch, then rerun it to green.

- [ ] **Step 7: Verify Task 2**

Run:

```powershell
npx.cmd prettier --write scripts/catalog/catalog-copy-preservation.mjs scripts/catalog/catalog-copy-preservation.d.mts tests/unit/catalog-copy-preservation.test.ts
npm.cmd test -- tests/unit/catalog-copy-diagnostic.test.ts tests/unit/catalog-copy-preservation.test.ts tests/unit/catalog-copy-contract.test.ts tests/unit/catalog-copy-provider.test.ts
npm.cmd run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit Task 2**

```powershell
git add scripts/catalog/catalog-copy-preservation.mjs scripts/catalog/catalog-copy-preservation.d.mts tests/unit/catalog-copy-preservation.test.ts
git commit -m "fix(catalog): retain copy review failures"
```

---

### Task 3: Project-submission report propagation

**Files:**
- Modify: `scripts/submissions/generate-project-submission.mjs:93-130,424-436`
- Modify: `scripts/submissions/generate-project-submission.d.mts:6-79`
- Modify: `tests/unit/generate-project-submission-cli.test.ts:686-725`
- Modify: `tests/unit/generate-project-submission.test.ts:190-226`
- Modify: `tests/unit/project-submission-pr.test.ts:137-170`

**Interfaces:**
- Consumes: `PreservedCatalogSummary["diagnostic"]` from Task 2.
- Produces: optional `copyReviewDiagnostic` on drafts and nullable `copy_review_diagnostic` on admission reports.

- [ ] **Step 1: Extend the unavailable CLI test and verify RED**

In the existing verified-owner fallback test, make the injected provider throw
a controlled error and assert:

```ts
expect(generated.report.copy_review_diagnostic).toEqual({
  failure_phase: "initial-provider",
  failure_code: "provider-timeout",
  diagnostic_code: null,
  attempt_count: 1,
  latency_ms: 900,
});
```

Run:

```powershell
npm.cmd test -- tests/unit/generate-project-submission-cli.test.ts
```

Expected: FAIL because the report field is absent.

- [ ] **Step 2: Propagate the diagnostic through draft and report**

Add `copyReviewDiagnostic: copy.diagnostic` in
`manualSummaryCopyDraftOptions`. Add
`copy_review_diagnostic: draft.copyReviewDiagnostic ?? null` to the generated
report. Declare both fields using `CopyReviewDiagnostic` from Task 1.

- [ ] **Step 3: Rerun the CLI test and verify GREEN**

Run `npm.cmd test -- tests/unit/generate-project-submission-cli.test.ts`.

Expected: PASS.

- [ ] **Step 4: Add direct report and compatibility assertions**

Update `generate-project-submission.test.ts` so an unavailable draft with a
diagnostic preserves it. Add a separate assertion that a draft without the new
property produces `copy_review_diagnostic: null`.

Run the test after each assertion; the propagation assertion must fail before
Step 2 and pass afterward, while the compatibility assertion documents the
nullable legacy behavior.

- [ ] **Step 5: Prove PR prose remains generic**

Give the unavailable report fixture in `project-submission-pr.test.ts` a
`copy_review_diagnostic` containing `provider-timeout`, render the PR, and add:

```ts
expect(body).toContain("Contextual catalog-copy review was unavailable");
expect(body).not.toContain("provider-timeout");
expect(body).not.toContain("initial-provider");
```

This should pass without production PR-renderer changes; if it fails, remove
diagnostic interpolation rather than weakening the assertion.

- [ ] **Step 6: Verify and commit Task 3**

Run:

```powershell
npx.cmd prettier --write scripts/submissions/generate-project-submission.mjs scripts/submissions/generate-project-submission.d.mts tests/unit/generate-project-submission-cli.test.ts tests/unit/generate-project-submission.test.ts tests/unit/project-submission-pr.test.ts
npm.cmd test -- tests/unit/generate-project-submission-cli.test.ts tests/unit/generate-project-submission.test.ts tests/unit/project-submission-pr.test.ts tests/unit/project-publication-transaction.test.ts tests/unit/project-publication-planner.test.ts
npm.cmd run typecheck
git add scripts/submissions/generate-project-submission.mjs scripts/submissions/generate-project-submission.d.mts tests/unit/generate-project-submission-cli.test.ts tests/unit/generate-project-submission.test.ts tests/unit/project-submission-pr.test.ts
git commit -m "fix(submissions): report copy diagnostics"
```

Expected: tests and typecheck pass before commit.

---

### Task 4: Owner-request report propagation

**Files:**
- Modify: `scripts/help/generate-project-owner-request.mjs:567-588`
- Modify: `scripts/help/generate-project-owner-request.d.mts:12-24`
- Modify: `tests/unit/generate-project-owner-request.test.ts:698-742`
- Modify: `tests/unit/project-owner-pr.test.ts:227-260`

**Interfaces:**
- Consumes: `PreservedCatalogSummary["diagnostic"]` from Task 2.
- Produces: optional `diagnostic` on each unavailable `OwnerCopyResult`.

- [ ] **Step 1: Extend the owner fallback test and verify RED**

Make the existing unavailable-copy fixture throw a controlled
`provider-response-invalid` error with `diagnosticCode: "json-invalid"` and
`latencyMs: 300`. Assert the affected `copy_results[]` entry includes:

```ts
diagnostic: {
  failure_phase: "initial-provider",
  failure_code: "provider-response-invalid",
  diagnostic_code: "json-invalid",
  attempt_count: 1,
  latency_ms: 300,
}
```

Run `npm.cmd test -- tests/unit/generate-project-owner-request.test.ts`.

Expected: FAIL because owner copy results do not propagate diagnostics.

- [ ] **Step 2: Add owner diagnostic propagation and verify GREEN**

Add `diagnostic: copied.diagnostic` to preserved `copyResults` entries and the
optional declaration to `OwnerCopyResult`. Do not add it to synthesized
automatic entries.

Rerun the owner generator test. Expected: PASS.

- [ ] **Step 3: Prove legacy validated reports and PR prose remain compatible**

Keep existing report fixtures without `diagnostic` unchanged and confirm they
still pass. In `project-owner-pr.test.ts`, add a diagnostic to the unavailable
fixture and assert:

```ts
expect(body).toContain("Contextual catalog-copy review was unavailable");
expect(body).not.toContain("provider-response-invalid");
expect(body).not.toContain("json-invalid");
```

- [ ] **Step 4: Verify and commit Task 4**

Run:

```powershell
npx.cmd prettier --write scripts/help/generate-project-owner-request.mjs scripts/help/generate-project-owner-request.d.mts tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-pr.test.ts
npm.cmd test -- tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-pr.test.ts tests/unit/project-publication-planner.test.ts tests/unit/project-publication-transaction.test.ts
npm.cmd run typecheck
git add scripts/help/generate-project-owner-request.mjs scripts/help/generate-project-owner-request.d.mts tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-pr.test.ts
git commit -m "fix(help): report owner copy diagnostics"
```

Expected: tests and typecheck pass before commit.

---

### Task 5: Public Actions summary wiring

**Files:**
- Modify: `.github/workflows/generate-project-submission.yml:139-148`
- Modify: `.github/workflows/generate-project-owner-request.yml:153-162`
- Modify: `tests/unit/workflows.test.ts:908-990,1136-1236`
- Test: `tests/unit/catalog-copy-diagnostic.test.ts`

**Interfaces:**
- Consumes: `renderCopyReviewDiagnosticSummary(values: readonly unknown[]): string` from Task 1 and the report fields from Tasks 3-4.
- Produces: one optional Markdown section appended to `GITHUB_STEP_SUMMARY` immediately after each successful generation.

- [ ] **Step 1: Add the submission workflow contract assertion and verify RED**

In the submission workflow test, assert the source contains the shared renderer,
the report field, and `GITHUB_STEP_SUMMARY`:

```ts
expect(source).toContain("renderCopyReviewDiagnosticSummary");
expect(source).toContain("report.copy_review_diagnostic");
expect(source).toContain("GITHUB_STEP_SUMMARY");
```

Run `npm.cmd test -- tests/unit/workflows.test.ts`.

Expected: FAIL on the missing renderer reference.

- [ ] **Step 2: Add the project-submission summary step and verify GREEN**

Immediately after generation, add a Bash step with an inline ESM script that:

```js
const report = JSON.parse(
  fs.readFileSync(`${process.env.RUNNER_TEMP}/admission-report.json`, "utf8"),
);
const values =
  report.copy_review_status === "unavailable"
    ? [report.copy_review_diagnostic]
    : [];
const summary = renderCopyReviewDiagnosticSummary(values);
if (summary) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
```

Import `fs` and the shared renderer. Do not print the report or caught errors.
Rerun `tests/unit/workflows.test.ts` and confirm the new assertion passes.

- [ ] **Step 3: Add the owner workflow contract assertion and verify RED**

Assert the owner workflow references the renderer and maps only unavailable
entries:

```ts
expect(source).toContain("renderCopyReviewDiagnosticSummary");
expect(source).toContain('entry.review_status === "unavailable"');
expect(source).toContain("entry.diagnostic");
```

Run the workflow test. Expected: FAIL before owner workflow wiring.

- [ ] **Step 4: Add the owner summary step and verify GREEN**

Immediately after owner generation, read
`project-owner-generation-report.json`, select unavailable entries, map their
optional `diagnostic` fields, render them, and append only a non-empty result to
`GITHUB_STEP_SUMMARY`. Do not include project IDs or any other report fields.

- [ ] **Step 5: Add a final renderer leakage regression**

Add a test with malformed phase, code, diagnostic, latency, and extra secret
fields. Assert the result contains the fixed generic unavailable row and none
of the supplied strings or numbers. Run the diagnostic unit test red before
tightening normalization, then green after the minimal sanitizer change.

- [ ] **Step 6: Format and verify Task 5**

Run:

```powershell
npx.cmd prettier --write .github/workflows/generate-project-submission.yml .github/workflows/generate-project-owner-request.yml tests/unit/workflows.test.ts tests/unit/catalog-copy-diagnostic.test.ts
npm.cmd test -- tests/unit/catalog-copy-diagnostic.test.ts tests/unit/workflows.test.ts tests/unit/project-submission-pr.test.ts tests/unit/project-owner-pr.test.ts
npm.cmd run lint
npm.cmd run typecheck
```

Expected: all commands exit 0 and no summary test contains raw injected text.

- [ ] **Step 7: Commit Task 5**

```powershell
git add .github/workflows/generate-project-submission.yml .github/workflows/generate-project-owner-request.yml tests/unit/workflows.test.ts tests/unit/catalog-copy-diagnostic.test.ts
git commit -m "ci: summarize copy review failures"
```

---

### Task 6: End-to-end regression and repository gates

**Files:**
- Verify only; modify implementation files only if a failing gate exposes a defect covered by the approved spec.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: fresh evidence that the complete copy-review, report, workflow, authority, and publication boundaries pass together.

- [ ] **Step 1: Run the complete focused regression set**

```powershell
npm.cmd test -- tests/unit/catalog-copy-diagnostic.test.ts tests/unit/catalog-copy-preservation.test.ts tests/unit/catalog-copy-contract.test.ts tests/unit/catalog-copy-provider.test.ts tests/unit/enrichment-provider.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/generate-project-submission.test.ts tests/unit/project-submission-pr.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-pr.test.ts tests/unit/project-publication-transaction.test.ts tests/unit/project-publication-planner.test.ts tests/unit/workflows.test.ts
```

Expected: all listed files pass with zero failed tests.

- [ ] **Step 2: Run static and content gates**

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run catalog:validate
npm.cmd run catalog:build
```

Expected: every command exits 0.

- [ ] **Step 3: Run the full repository verification**

```powershell
npm.cmd run check
```

Expected: format, lint, palette audit, catalog validation/build, security report
validation, typecheck, unit tests, production build, and static export
verification all exit 0.

- [ ] **Step 4: Review the final diff and security boundary**

Run:

```powershell
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git status -sb
rg -n "message|submittedSummary|submitted_summary|prompt|output" scripts/catalog/catalog-copy-diagnostic.mjs .github/workflows/generate-project-submission.yml .github/workflows/generate-project-owner-request.yml
```

Inspect every match. Confirm diagnostics contain no raw text fields, workflow
steps never serialize the whole report to the summary, PR renderers remain
generic, catalog/transaction files are unchanged, and the worktree contains no
unintended files.
