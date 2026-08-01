# Submission Enrichment Provider Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make automatic project submissions reliably reach a review PR despite transient or malformed provider responses, while continuing to reject unsupported catalog copy and exposing a useful sanitized failure reason when the bounded attempt budget is exhausted.

**Architecture:** Keep Tavernary's local catalog validator authoritative and fail closed. Make the provider response mode explicit instead of assuming every OpenAI-compatible model enforces `json_schema`; run the confirmed production model, MiniMax M3 Thinking, in prompt-JSON mode because MiniMax documents native `response_format` support only for `MiniMax-Text-01`. Spend one shared five-call budget across malformed responses, transient transport errors, and field-targeted validation repairs. Persist a sanitized attempt report before any terminal throw so workflow reconciliation can distinguish transport, parsing, and contract failures without publishing model output.

**Tech Stack:** Node.js 24 ESM, TypeScript declarations, Vitest 4, GitHub Actions, GitHub CLI, OpenAI-compatible Chat Completions API

## Global Constraints

- Preserve the current admission/generation boundary: admission may pass while generation fails.
- Preserve strict automatic-copy validation; do not truncate, splice, zero-fill, or accept a rejected summary.
- Never create or update a generated branch, review PR, or catalog record from invalid automatic metadata.
- Use at most five provider calls for one project-generation attempt, including transport retries and validation repairs.
- Retry only sanitized transient/response failures: timeout, network, HTTP 429, HTTP 5xx, and malformed provider content.
- Do not retry authentication, request-shape, model-mismatch, source, admission, or catalog-integrity failures.
- Keep provider credentials, raw response bodies, source text, and rejected generated prose out of issue comments and uploaded reports.
- Preserve existing exact-head, branch-ownership, path-collision, and issue-state guards.
- Do not weaken the 120-220 character summary, evidence, controlled-tag, copy-policy, or emoji contracts.
- Treat the production endpoint as a runtime fact and the user-confirmed production model as MiniMax M3 Thinking. Do not print either secret configuration value.

---

## Incident Findings to Preserve as Regression Cases

- Issue `#176` exhausted five validation-repair calls. Its last candidate still had an over-220-character summary and invalid evidence references.
- Issue `#177` failed on malformed structured content. The current attempt helper does not retry any thrown provider error, so this class exits after one call.
- Other recent runs show the same surface failing as HTTP 429, timeout, missing/nested fields, primitive summary/tag values, and overlong summaries; a later retry can succeed without source or code changes.
- The production workflow currently reduces every terminal generation error to `generation-failed`.
- The submission catch keeps only `code` and `message`; it drops `diagnosticCode`, latency, attempt count, response mode, and the last validation failures.
- The confirmed production model is MiniMax M3 Thinking. MiniMax's current API documentation limits `response_format` support to `MiniMax-Text-01`, so the current transport is relying on behavior the model does not officially support.

---

## File Structure

- Modify `scripts/catalog/enrichment-provider.mjs` and `.d.mts`: explicit response mode, prompt-JSON transport, safe retry metadata, and capability metadata.
- Modify `scripts/catalog/enrichment-attempts.mjs` and `.d.mts`: one total call budget covering validation repair and retryable thrown errors.
- Modify `scripts/catalog/tag-classification.mjs` and `.d.mts`: structured invalid-field diagnostics for targeted repairs.
- Modify `scripts/catalog/enrich-readmes.mjs` and `.d.mts`: merge valid fields, regenerate only invalid fields, and return attempt telemetry.
- Modify `scripts/submissions/generate-project-submission.mjs` and `.d.mts`: preserve safe diagnostics and always write a failure report.
- Modify `scripts/submissions/project-generation-failure.mjs` and `.d.mts`: read the sanitized report and publish a specific safe reason category.
- Modify `.github/workflows/generate-project-submission.yml`: pass response mode, upload the report on failure, and reconcile from it.
- Modify `.github/workflows/generate-project-owner-request.yml`, `.github/workflows/enrich-catalog.yml`, and `.github/workflows/review-catalog-policy.yml`: pass the same explicit response-mode configuration to shared provider consumers.
- Modify `docs/maintenance/operations-runbook.md`: document the response-mode variable, capability preflight, retry categories, and recovery procedure.
- Test `tests/unit/enrichment-provider.test.ts`.
- Test `tests/unit/enrichment-attempts.test.ts`.
- Test `tests/unit/tag-classification.test.ts`.
- Test `tests/unit/enrich-readmes.test.ts`.
- Test `tests/unit/enrich-readmes-cli.test.ts`.
- Test `tests/unit/generate-project-submission.test.ts`.
- Test `tests/unit/generate-project-submission-cli.test.ts`.
- Test `tests/unit/project-generation-failure.test.ts`.
- Test `tests/unit/workflows.test.ts`.

---

### Task 1: Encode the Two Live Failures as Red Tests

**Files:**
- Modify: `tests/unit/enrichment-attempts.test.ts`
- Modify: `tests/unit/enrich-readmes.test.ts`
- Modify: `tests/unit/generate-project-submission-cli.test.ts`

**Interfaces:**
- Consumes: existing `generateValidatedEnrichment(...)` and submission CLI injection points.
- Produces: sanitized fixtures representing malformed content and exhausted summary/evidence validation.

- [ ] **Step 1: Add a malformed-content retry regression**

Replace the existing test named `"does not retry a thrown provider failure"` with two tests:

```ts
test("retries malformed provider content inside the total budget", async () => {
  const invalid = Object.assign(new Error("invalid structured content"), {
    code: "provider-response-invalid",
    diagnosticCode: "json-invalid",
    latencyMs: 40,
  });
  const generate = vi
    .fn()
    .mockRejectedValueOnce(invalid)
    .mockResolvedValueOnce({
      output: { value: "good" },
      metadata: { latencyMs: 20 },
    });

  const result = await generateValidatedEnrichment({
    initialInput: {},
    maxAttempts: 5,
    generate,
    validate: () => ({ valid: true as const }),
    repair: (input) => input,
    sleep: vi.fn(),
  });

  expect(result.attempts).toHaveLength(2);
  expect(generate).toHaveBeenCalledTimes(2);
});

test.each([
  "provider-authentication-failed",
  "provider-request-failed",
  "provider-model-mismatch",
])("does not retry terminal provider code %s", async (code) => {
  // Assert exactly one call and the original safe error.
});
```

- [ ] **Step 2: Add an exhausted summary/evidence regression**

In `tests/unit/enrich-readmes.test.ts`, provide five candidates whose summary is over 220 characters and whose evidence contains an empty or over-160-character entry. Assert:

- exactly five total calls;
- every repair after the first requests `summary`;
- the fifth validation failure is returned as `output-invalid`;
- no candidate is truncated or copied into a record.

- [ ] **Step 3: Add a CLI failure-report regression**

In `tests/unit/generate-project-submission-cli.test.ts`, inject a provider error with:

```ts
{
  code: "provider-response-invalid",
  diagnosticCode: "json-invalid",
  latencyMs: 70
}
```

Assert the CLI exits non-zero after writing a report that contains only safe codes, counts, model metadata, response mode, and latency. Assert it does not contain raw provider content, repository README text, or rejected summary text.

- [ ] **Step 4: Run the regressions and verify RED**

```powershell
npx.cmd vitest run tests/unit/enrichment-attempts.test.ts tests/unit/enrich-readmes.test.ts tests/unit/generate-project-submission-cli.test.ts
```

Expected: FAIL because thrown response errors exit after one call, repair remains full-shape, and terminal generation does not write a diagnostic report.

---

### Task 2: Make Provider Response Capability Explicit

**Files:**
- Modify: `scripts/catalog/enrichment-provider.mjs`
- Modify: `scripts/catalog/enrichment-provider.d.mts`
- Modify: `tests/unit/enrichment-provider.test.ts`
- Modify: `tests/unit/enrich-readmes-cli.test.ts`

**Interfaces:**
- Consumes: `TAVERNARY_ENRICHMENT_RESPONSE_MODE`.
- Produces: `responseMode: "json-schema" | "prompt-json"` in provider metadata.
- Produces: the same parsed JavaScript object and local validation boundary in both modes.

- [ ] **Step 1: Add failing configuration and request-shape tests**

Add tests proving:

- missing or unknown response mode fails configuration with no network call;
- `json-schema` sends the existing strict `response_format`;
- `prompt-json` omits `response_format`, includes the exact schema requirements in the system/user prompt, and still uses temperature `0.2` initially and `0` for repair;
- provider metadata records the selected response mode;
- no secret, raw response body, or prompt text appears in errors.

- [ ] **Step 2: Verify RED**

```powershell
npx.cmd vitest run tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes-cli.test.ts
```

- [ ] **Step 3: Add explicit response-mode configuration**

Extend provider configuration:

```js
const RESPONSE_MODES = new Set(["json-schema", "prompt-json"]);

function validateResponseMode(value) {
  if (!RESPONSE_MODES.has(value)) {
    throw new Error(
      "Enrichment response mode must be json-schema or prompt-json.",
    );
  }
  return value;
}
```

Do not infer support from the model name. For `json-schema`, retain the current request. For `prompt-json`, omit `response_format` and append a generated compact schema contract to the trusted system prompt. Continue parsing only a single JSON object from message content and continue rejecting prose, arrays, scalars, and mixed tool calls.

- [ ] **Step 4: Extend safe provider error metadata**

Add these non-secret properties to `EnrichmentProviderError`:

```js
this.httpStatus = details.httpStatus ?? null;
this.retryAfterMs = details.retryAfterMs ?? null;
this.responseMode = details.responseMode ?? null;
```

Parse `Retry-After` only for bounded retry timing. Never retain or report response bodies or headers other than the normalized delay.

- [ ] **Step 5: Configure and prove prompt-JSON mode without changing the model**

Set the non-secret repository variable:

```powershell
gh api --method PATCH repos/MentallyQuill/Tavernary/actions/variables/TAVERNARY_ENRICHMENT_RESPONSE_MODE -f name=TAVERNARY_ENRICHMENT_RESPONSE_MODE -f value=prompt-json
```

If the variable does not exist, create it with the repository Actions Variables API instead of PATCH. Then run the existing preflight from a manually dispatched workflow using the current MiniMax M3 Thinking model and endpoint:

```powershell
gh workflow run enrich-catalog.yml --ref main -f mode=preflight
$runId = gh run list --workflow enrich-catalog.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $runId --exit-status
```

Record requested model, returned model, selected `prompt-json` response mode, validation status, retry count, and diagnostic code. Do not print the API URL or key. Keep `json-schema` available only for a future model or endpoint whose native support is documented and separately proven. Do not switch the production model secret as part of this repair.

- [ ] **Step 6: Verify GREEN**

```powershell
npx.cmd vitest run tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes-cli.test.ts
```

---

### Task 3: Retry Safe Transport and Parsing Failures Within One Budget

**Files:**
- Modify: `scripts/catalog/enrichment-attempts.mjs`
- Modify: `scripts/catalog/enrichment-attempts.d.mts`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `tests/unit/enrichment-attempts.test.ts`
- Modify: `tests/unit/enrich-readmes.test.ts`

**Interfaces:**
- Produces: `attempts[]` with safe outcome, code, diagnostic code, latency, and delay.
- Consumes: injected `sleep(milliseconds)` for deterministic tests.
- Maintains: `maxAttempts = 5` as the total number of network calls.

- [ ] **Step 1: Add parameterized retry-policy tests**

Assert retry for:

- `provider-timeout`;
- `provider-network-error`;
- `provider-rate-limited`;
- `provider-server-error`;
- `provider-response-invalid` with `content-missing`, `content-parts-invalid`, `json-invalid`, `json-not-object`, or no diagnostic.

Assert no retry for authentication, request failure, model mismatch, source failure, and arbitrary programmer errors.

- [ ] **Step 2: Add total-budget and delay tests**

Use injected sleep and deterministic delays:

```js
export const SUBMISSION_RETRY_DELAYS_MS = [0, 2_000, 8_000, 20_000];
```

Use the normalized `Retry-After` value when it is longer, capped at 30 seconds. Assert that a sequence of two thrown errors and three validation failures makes five calls, not seven.

- [ ] **Step 3: Implement the shared loop**

Extend `generateValidatedEnrichment` so every call consumes one attempt. On a retryable thrown error, append safe telemetry, sleep if another call remains, and retry the same input. On a validation failure, append validation telemetry, build repaired input, and continue. Return:

```ts
{
  output,
  metadata,
  validation,
  attempts: Array<{
    number: number;
    outcome: "provider-error" | "validation-failed" | "accepted";
    code?: string;
    diagnosticCode?: string | null;
    latencyMs?: number | null;
    delayMs?: number;
  }>;
}
```

If the final call throws, rethrow an error carrying the safe `attempts` array. If the final candidate fails validation, return it unchanged with the attempt trace.

- [ ] **Step 4: Reuse, do not duplicate, retry classification**

Move the existing transient preflight code set in `enrich-readmes.mjs` behind the shared retry classifier. Keep preflight's separate outer budget and published report shape, but make its definition of transient codes match submission generation.

- [ ] **Step 5: Verify GREEN**

```powershell
npx.cmd vitest run tests/unit/enrichment-attempts.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts
```

---

### Task 4: Repair Only Invalid Fields and Preserve Valid Candidate Work

**Files:**
- Modify: `scripts/catalog/tag-classification.mjs`
- Modify: `scripts/catalog/tag-classification.d.mts`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Modify: `tests/unit/tag-classification.test.ts`
- Modify: `tests/unit/enrich-readmes.test.ts`
- Modify: `tests/unit/enrichment-provider.test.ts`

**Interfaces:**
- Produces: `invalidFields: Array<"summary" | "tags" | "classification_review" | "copy_diagnostics">`.
- Consumes: existing `requestedFields`.
- Preserves: valid candidate fields and diagnostics across a targeted repair.

- [ ] **Step 1: Add structured-validation tests**

For each validator defect, assert the field mapping:

- summary value or summary evidence -> `summary`;
- tag shape, tag ID, or tag evidence -> `tags`;
- classification value/evidence -> `classification_review`;
- result/change reasons/policy signal -> `copy_diagnostics`.

Keep existing human-readable errors for logs and tests.

- [ ] **Step 2: Add targeted-repair merge tests**

Cover:

1. valid tags plus invalid summary;
2. valid summary plus invalid tags;
3. valid summary/tags plus invalid copy diagnostics;
4. a repair that fixes one field but breaks another;
5. all five candidates invalid.

Assert a repair request's schema contains only the invalid generated fields plus the diagnostics required for those fields. Assert accepted fields are merged from the previous candidate and the complete merged object is revalidated before acceptance.

- [ ] **Step 3: Implement invalid-field diagnostics**

Return `invalidFields` on invalid validation results. Derive it while creating each error; do not parse human-readable error strings downstream.

- [ ] **Step 4: Implement targeted repair input and merge**

Replace full-shape repair with:

```js
{
  ...originalTrustedInput,
  requestedFields: requestedFieldsFor(validation.invalidFields),
  repair: {
    hint: validation.repairHint,
    rejectedSummary: invalidSummaryOnly,
  },
}
```

Keep the last valid value for every field not requested in the repair. Merge the new candidate into that accumulator, then run the full original validator. Never preserve a field that its own validation marked invalid.

- [ ] **Step 5: Verify no semantic post-processing was introduced**

```powershell
rg -n "truncate|slice\\(|substring\\(|padEnd|default summary|fallback summary" scripts/catalog scripts/submissions
```

Review matches and confirm generated copy is not being shortened, padded, or substituted.

- [ ] **Step 6: Verify GREEN**

```powershell
npx.cmd vitest run tests/unit/tag-classification.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts
```

---

### Task 5: Preserve Safe Failure Diagnostics Through Workflow Reconciliation

**Files:**
- Modify: `scripts/submissions/generate-project-submission.mjs`
- Modify: `scripts/submissions/generate-project-submission.d.mts`
- Modify: `scripts/submissions/project-generation-failure.mjs`
- Modify: `scripts/submissions/project-generation-failure.d.mts`
- Modify: `.github/workflows/generate-project-submission.yml`
- Modify: `tests/unit/generate-project-submission.test.ts`
- Modify: `tests/unit/generate-project-submission-cli.test.ts`
- Modify: `tests/unit/project-generation-failure.test.ts`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**
- Produces: versioned `project-generation-report.json` on success and failure.
- Consumes: report path in reconciliation.
- Produces: a sanitized issue reason such as `provider-response-invalid:json-invalid` or `output-invalid:summary`.

- [ ] **Step 1: Define and test the report schema**

Use a versioned report:

```json
{
  "schema_version": 1,
  "status": "failed",
  "stage": "enrichment",
  "reason_code": "provider-response-invalid",
  "diagnostic_code": "json-invalid",
  "invalid_fields": [],
  "provider": {
    "requested_model": "safe identifier",
    "returned_model": "safe identifier or null",
    "response_mode": "prompt-json",
    "call_count": 2,
    "total_latency_ms": 110
  },
  "attempts": []
}
```

For `output-invalid`, include `invalid_fields` and normalized validator rule IDs, not generated values or full error messages.

- [ ] **Step 2: Always write the report before terminal exit**

Refactor the CLI boundary so admission/source/enrichment/draft failures are caught once, converted to a sanitized report, written atomically to `--report-path`, and then rethrown for a non-zero exit. Keep successful report compatibility or version both states together.

- [ ] **Step 3: Make reconciliation consume the report**

Add `GENERATION_REPORT_PATH` to `project-generation-failure.mjs`. Validate the report schema and allowlist reason/diagnostic values. If the file is absent or invalid, fall back to `generation-failed`.

Update the issue marker comment to show:

```md
Reason category: `provider-response-invalid`
Diagnostic: `json-invalid`
Provider calls: `2/5`
```

Do not include latency, model output, prompts, source excerpts, or validator prose in the public issue comment.

- [ ] **Step 4: Upload the report even when generation fails**

In `.github/workflows/generate-project-submission.yml`:

- name the artifact `project-submission-${{ inputs.issue_number }}-generation`;
- upload with `if: always() && !cancelled()`;
- use `if-no-files-found: error` because the CLI must now always write it;
- pass the report path to failure reconciliation;
- keep every PR/catalog mutation step skipped after a failed generation step.

- [ ] **Step 5: Add workflow order and safety assertions**

Assert:

- report upload and reconciliation run after generation failure;
- validation, commit, push, and PR steps do not use `always()` or `continue-on-error`;
- failure report is read only from `RUNNER_TEMP`;
- no report field is interpolated directly into shell commands;
- the existing issue/PR/state guards remain.

- [ ] **Step 6: Verify GREEN**

```powershell
npx.cmd vitest run tests/unit/generate-project-submission.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/project-generation-failure.test.ts tests/unit/workflows.test.ts
```

---

### Task 6: Wire Runtime Configuration and Operations Documentation

**Files:**
- Modify: `.github/workflows/generate-project-submission.yml`
- Modify: `.github/workflows/generate-project-owner-request.yml`
- Modify: `.github/workflows/enrich-catalog.yml`
- Modify: `.github/workflows/review-catalog-policy.yml`
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**
- Consumes: `${{ vars.TAVERNARY_ENRICHMENT_RESPONSE_MODE }}`.
- Preserves: secret API URL, key, and model handling.

- [ ] **Step 1: Add failing workflow assertions**

Assert all workflows using the shared enrichment provider pass:

```yaml
TAVERNARY_ENRICHMENT_RESPONSE_MODE: ${{ vars.TAVERNARY_ENRICHMENT_RESPONSE_MODE }}
```

Assert the value is a repository variable, not a secret and not hard-coded per workflow.

- [ ] **Step 2: Wire the variable and document deployment order**

Document:

1. create/update the repository variable;
2. run preflight;
3. dispatch one known retryable issue;
4. verify the report artifact and PR;
5. only then recover the remaining backlog.

Document safe failure categories and which ones are retryable.

- [ ] **Step 3: Audit other direct `response_format` callers**

```powershell
rg -n "response_format|json_schema" scripts
```

Record whether catalog-copy, moderation, and taxonomy callers share the same endpoint/model. If they do, open a follow-up or migrate them to the same explicit mode in this change only when their existing contract tests can remain fail closed. Do not silently leave them assuming unsupported native schema enforcement.

- [ ] **Step 4: Verify workflow and documentation tests**

```powershell
npx.cmd vitest run tests/unit/workflows.test.ts
npx.cmd prettier --check .github/workflows/generate-project-submission.yml .github/workflows/generate-project-owner-request.yml .github/workflows/enrich-catalog.yml .github/workflows/review-catalog-policy.yml docs/maintenance/operations-runbook.md
```

---

### Task 7: Full Verification, Deployment, and Recovery of Issues 176-177

**Files:**
- Verify all files changed by Tasks 1-6.
- No catalog record changes are part of the implementation commit.

- [ ] **Step 1: Run all focused tests**

```powershell
npx.cmd vitest run tests/unit/enrichment-provider.test.ts tests/unit/enrichment-attempts.test.ts tests/unit/tag-classification.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/generate-project-submission.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/project-generation-failure.test.ts tests/unit/workflows.test.ts
```

- [ ] **Step 2: Run the full repository gate**

```powershell
npm.cmd run check
```

Expected: format, lint, palette, catalog validation/build, typecheck, all Vitest tests, production build, and export verification pass.

- [ ] **Step 3: Inspect scope**

```powershell
git diff --check
git status --short
git diff --stat
```

Keep the implementation isolated from the existing local documentation commits and untracked plans.

- [ ] **Step 4: Publish through review**

Create a `codex/` branch from current `origin/main`, apply only this plan's commits, push, open a review PR, and monitor every workflow for the exact head SHA. Merge only after required checks pass.

- [ ] **Step 5: Verify the merged production configuration**

```powershell
gh api repos/MentallyQuill/Tavernary/actions/variables/TAVERNARY_ENRICHMENT_RESPONSE_MODE
gh workflow run enrich-catalog.yml --ref main -f mode=preflight
$runId = gh run list --workflow enrich-catalog.yml --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $runId --exit-status
```

Confirm the workflow used the intended response mode and exact merged `main` SHA.

- [ ] **Step 6: Recover issue 176**

Dispatch `generate-project-submission.yml` for issue `176`. Verify:

- five-call total budget is respected;
- summary/evidence repair is field-targeted;
- the review PR is created and the issue becomes `submission-pr-open`; or
- if still exhausted, the issue remains `submission-retryable` with a specific sanitized report and no partial branch/catalog change.

- [ ] **Step 7: Recover issue 177**

Dispatch issue `177` only after issue `176` proves the deployed path. Verify malformed JSON/content receives a bounded retry and the same success/fail-closed outcomes.

- [ ] **Step 8: Audit the recent retryable backlog**

```powershell
gh issue list --repo MentallyQuill/Tavernary --state open --label submission-retryable --limit 100 --json number,title,labels,url
```

Classify each remaining issue by its latest sanitized report. Re-dispatch only provider/transient failures; leave source, admission, collision, and policy failures for maintainer action.

- [ ] **Step 9: Record completion evidence**

Report:

- focused and full test counts;
- implementation and merged SHAs;
- preflight run URL and selected response mode;
- issue `#176` and `#177` generation run URLs;
- created PR URLs or exact sanitized exhaustion categories;
- confirmation that no invalid catalog change was published.

---

## Self-Review Checklist

- [ ] Every observed failure class maps to a test and an explicit retry/no-retry rule.
- [ ] The five-call limit counts both thrown provider failures and validation repairs.
- [ ] The plan does not rely on provider-native schema support without a capability probe.
- [ ] Local validation remains authoritative in every response mode.
- [ ] Field-targeted repair never preserves a field marked invalid.
- [ ] Failure artifacts and issue comments contain no raw model/source content.
- [ ] Workflow failure handling cannot fall through to commit, push, or PR creation.
- [ ] Runtime variable deployment happens before retrying live issues.
- [ ] Existing unrelated worktree changes remain untouched.
