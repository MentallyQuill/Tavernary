# Utility-First JSON Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every Tavernary structured model request through the `UTILITY_*` DeepSeek provider first and invoke the existing Luna provider once only to repair malformed or schema-invalid JSON.

**Architecture:** Keep `createStructuredProviderTransport` as the single provider network boundary. Add one environment adapter for the primary and repair credential sets, validate parsed output locally with the exact request JSON Schema, and issue a minimal source-free Luna request only for eligible structural failures. Existing domain validators and semantic utility-provider retries remain authoritative.

**Tech Stack:** Node.js 24, JavaScript ESM, TypeScript declaration files, AJV 8, Vitest 4, GitHub Actions, OpenAI-compatible Chat Completions.

## Global Constraints

- `UTILITY_API_ENDPOINT`, `UTILITY_API_KEY`, and `UTILITY_MODEL` are the primary provider credentials.
- `TAVERNARY_ENRICHMENT_API_URL`, `TAVERNARY_ENRICHMENT_API_KEY`, and `TAVERNARY_ENRICHMENT_MODEL` are the JSON-repair provider credentials.
- Luna receives no original messages, README, source evidence, TavernKeeper report, project context, or workflow instructions.
- Luna is called at most once and only when textual primary output is malformed JSON, has a non-object root, or fails the exact response JSON Schema.
- Missing/unsafe content, tool calls, provider errors, model mismatch, and downstream semantic validation failures never invoke Luna.
- Repair failure rethrows the original sanitized primary invalid-response error.
- No raw primary or repair output is logged or persisted.
- No secret values are changed and no model-backed workflow is dispatched.
- Development remains on `codex/utility-json-repair`; publish a draft PR and do not merge it.

---

### Task 1: Two-provider environment contract

**Files:**
- Create: `scripts/catalog/model-provider-configuration.mjs`
- Create: `scripts/catalog/model-provider-configuration.d.mts`
- Create: `tests/unit/model-provider-configuration.test.ts`

**Interfaces:**
- Consumes: a Node-style environment object with the six approved secret names.
- Produces: `modelProviderOptionsFromEnvironment(environment)` returning the existing primary top-level transport fields plus nested `jsonRepair` configuration.

- [ ] **Step 1: Write the failing environment-mapping tests**

```ts
import { expect, test } from "vitest";
import { modelProviderOptionsFromEnvironment } from "../../scripts/catalog/model-provider-configuration.mjs";

test("maps UTILITY to primary and TAVERNARY_ENRICHMENT to JSON repair", () => {
  expect(
    modelProviderOptionsFromEnvironment({
      UTILITY_API_ENDPOINT: "https://nano.example/v1/chat/completions",
      UTILITY_API_KEY: "utility-key",
      UTILITY_MODEL: "deepseek/deepseek-v4-flash-0731:thinking",
      TAVERNARY_ENRICHMENT_API_URL:
        "https://api.openai.com/v1/chat/completions",
      TAVERNARY_ENRICHMENT_API_KEY: "repair-key",
      TAVERNARY_ENRICHMENT_MODEL: "gpt-5.6-luna",
    }),
  ).toEqual({
    apiUrl: "https://nano.example/v1/chat/completions",
    apiKey: "utility-key",
    model: "deepseek/deepseek-v4-flash-0731:thinking",
    jsonRepair: {
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: "repair-key",
      model: "gpt-5.6-luna",
    },
  });
});

test("does not silently reverse primary and repair providers", () => {
  const options = modelProviderOptionsFromEnvironment({
    UTILITY_MODEL: "utility-model",
    TAVERNARY_ENRICHMENT_MODEL: "repair-model",
  });
  expect(options.model).toBe("utility-model");
  expect(options.jsonRepair.model).toBe("repair-model");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- tests/unit/model-provider-configuration.test.ts`

Expected: FAIL because `model-provider-configuration.mjs` does not exist.

- [ ] **Step 3: Implement the exact mapping**

```js
export function modelProviderOptionsFromEnvironment(
  environment = process.env,
) {
  return {
    apiUrl: environment.UTILITY_API_ENDPOINT,
    apiKey: environment.UTILITY_API_KEY,
    model: environment.UTILITY_MODEL,
    jsonRepair: {
      apiUrl: environment.TAVERNARY_ENRICHMENT_API_URL,
      apiKey: environment.TAVERNARY_ENRICHMENT_API_KEY,
      model: environment.TAVERNARY_ENRICHMENT_MODEL,
    },
  };
}
```

Declare the same return shape in `model-provider-configuration.d.mts` without exposing secret values or adding defaults.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- tests/unit/model-provider-configuration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the configuration contract**

```powershell
git add scripts/catalog/model-provider-configuration.mjs scripts/catalog/model-provider-configuration.d.mts tests/unit/model-provider-configuration.test.ts
git commit -m "feat(models): add utility provider contract"
```

### Task 2: Shared one-call JSON repair transport

**Files:**
- Modify: `scripts/catalog/enrichment-provider.mjs`
- Modify: `scripts/catalog/enrichment-provider.d.mts`
- Modify: `tests/unit/enrichment-provider.test.ts`

**Interfaces:**
- Consumes: existing primary provider options plus optional `jsonRepair: { apiUrl, apiKey, model }` and each request's `response_format.json_schema.schema`.
- Produces: the existing `{ output, metadata }` result with optional `metadata.jsonRepair`; exports bounded repair constants for contract tests.

- [ ] **Step 1: Write failing tests for successful primary routing**

Add a test whose `fetchImpl` distinguishes URLs and records calls:

```ts
const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
const provider = createEnrichmentProvider({
  apiUrl: "https://nano.example/v1/chat/completions",
  apiKey: "utility-key",
  model: "deepseek/deepseek-v4-flash-0731:thinking",
  jsonRepair: {
    apiUrl: "https://openai.example/v1/chat/completions",
    apiKey: "repair-key",
    model: "gpt-5.6-luna",
  },
  fetchImpl: async (url, init) => {
    requests.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(
      JSON.stringify({
        model: "deepseek/deepseek-v4-flash-0731:thinking",
        choices: [{ message: { content: JSON.stringify(output) } }],
      }),
      { status: 200 },
    );
  },
});

await provider.generate(input);
expect(requests).toHaveLength(1);
expect(requests[0].url).toBe(
  "https://nano.example/v1/chat/completions",
);
```

This test catches any implementation that calls Luna eagerly or uses the old credential set as primary.

- [ ] **Step 2: Write failing syntax- and schema-repair tests**

Use a primary response containing leading prose for syntax repair and a parsed object missing required fields for schema repair. Return the valid `output` object from the repair URL. Assert:

```ts
expect(requests.map(({ url }) => url)).toEqual([
  "https://nano.example/v1/chat/completions",
  "https://openai.example/v1/chat/completions",
]);
expect(repairBody.model).toBe("gpt-5.6-luna");
expect(repairBody.reasoning_effort).toBe("none");
expect(repairBody.max_completion_tokens).toBeLessThanOrEqual(4096);
expect(repairBody.response_format).toEqual(primaryBody.response_format);
expect(JSON.stringify(repairBody)).not.toContain("PRIVATE README MARKER");
expect(result.metadata).toMatchObject({
  requestedModel: "deepseek/deepseek-v4-flash-0731:thinking",
  jsonRepair: {
    requestedModel: "gpt-5.6-luna",
    succeeded: true,
  },
});
```

- [ ] **Step 3: Write failing ineligible-failure tests**

Table-drive missing content, unsafe content parts, tool calls, returned-model mismatch, 401, 429, 500, network failure, and timeout. Assert the original controlled error code and `repairFetchCalls === 0` for every case.

Add a downstream semantic test using valid schema-shaped output that fails `validateEnrichmentOutput`; assert the existing utility-provider retry path is used and the repair URL is never called.

- [ ] **Step 4: Write failing repair fail-closed tests**

Cover repair HTTP failure, repair model mismatch, malformed repair JSON, and schema-invalid repair JSON. Capture the original primary error and assert the final error retains its `code` and `diagnosticCode`. Assert two total network calls and no recursive third call.

- [ ] **Step 5: Run transport tests and verify RED**

Run: `npm.cmd test -- tests/unit/enrichment-provider.test.ts tests/unit/enrichment-attempts.test.ts`

Expected: FAIL because `jsonRepair` is ignored and schema validation is absent.

- [ ] **Step 6: Implement bounded text extraction and schema validation**

Import AJV and add request-local validation:

```js
import Ajv from "ajv";

export const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
export const MAX_JSON_REPAIR_INPUT_BYTES = 64 * 1024;
export const MAX_JSON_REPAIR_RESPONSE_BYTES = 128 * 1024;
export const MAX_JSON_REPAIR_COMPLETION_TOKENS = 4096;

const ajv = new Ajv({ allErrors: true, strict: false });

function schemaValidator(body) {
  const schema = body?.response_format?.json_schema?.schema;
  return schema ? ajv.compile(schema) : null;
}
```

Read successful provider envelopes through a bounded byte reader before
`JSON.parse`. Keep `parseProviderMessage`'s public behavior unchanged, while an
internal extractor retains the damaged text only long enough for an eligible
repair request.

- [ ] **Step 7: Implement the one-call repair request**

Validate `options.jsonRepair` independently. Build a repair request from only:

```js
{
  diagnostic: primaryError.diagnosticCode,
  schema_errors: sanitizeSchemaErrors(validator.errors),
  target_schema: body.response_format.json_schema.schema,
  damaged_output: damagedText,
}
```

Send it to the repair configuration with the original `response_format`,
`reasoning_effort: "none"` for GPT-5.6, and
`max_completion_tokens: MAX_JSON_REPAIR_COMPLETION_TOKENS`. Parse and validate
without passing repair configuration into the repair request path. On any
repair failure, throw the captured primary error.

- [ ] **Step 8: Update declarations and metadata types**

Add `jsonRepair` to provider options and this optional result metadata:

```ts
jsonRepair?: {
  diagnosticCode: string;
  requestedModel: string;
  returnedModel: string | null;
  latencyMs: number;
  succeeded: true;
};
```

- [ ] **Step 9: Run focused tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/enrichment-provider.test.ts tests/unit/enrichment-attempts.test.ts tests/unit/catalog-copy-provider.test.ts tests/unit/catalog-policy-review-provider.test.ts tests/unit/tavernkeeper-synthesis.test.ts tests/unit/discover-tag-taxonomy.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit the transport**

```powershell
git add scripts/catalog/enrichment-provider.mjs scripts/catalog/enrichment-provider.d.mts tests/unit/enrichment-provider.test.ts
git commit -m "feat(models): repair invalid utility JSON"
```

### Task 3: Route every production model entry point through the shared contract

**Files:**
- Modify: `scripts/catalog/catalog-copy-preservation.mjs`
- Modify: `scripts/catalog/discover-tag-taxonomy.mjs`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrichment-rollout-plan.mjs`
- Modify: `scripts/help/generate-project-owner-request.mjs`
- Modify: `scripts/security/import-tavernkeeper-reports.mjs`
- Modify: `scripts/submissions/generate-project-submission.mjs`
- Modify: `.github/workflows/review-catalog-policy.yml`
- Modify: `tests/unit/catalog-copy-preservation.test.ts`
- Modify: `tests/unit/discover-tag-taxonomy.test.ts`
- Modify: `tests/unit/enrich-readmes-cli.test.ts`
- Modify: `tests/unit/enrichment-rollout-plan.test.ts`
- Modify: `tests/unit/generate-project-owner-request.test.ts`
- Modify: `tests/unit/generate-project-submission-cli.test.ts`
- Modify: `tests/unit/tavernkeeper-synthesis.test.ts`

**Interfaces:**
- Consumes: `modelProviderOptionsFromEnvironment` from Task 1.
- Produces: every default provider constructor receives utility primary options and nested Luna repair options; rollout state records `UTILITY_MODEL` as the expected generation model.

- [ ] **Step 1: Write failing routing tests for default entry points**

Add or update tests so injected environments produce `UTILITY_MODEL` as the configured/expected model and pass a nested repair configuration. For the catalog CLI contract, assert:

```ts
expect(result.requested_model).toBe(
  "deepseek/deepseek-v4-flash-0731:thinking",
);
```

For TavernKeeper synthesis, keep `synthesis_model` equal to the primary utility model even when `metadata.jsonRepair` exists; Luna repaired structure but did not author the assessment.

- [ ] **Step 2: Run the entry-point tests and verify RED**

Run: `npm.cmd test -- tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-rollout-plan.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/tavernkeeper-synthesis.test.ts tests/unit/discover-tag-taxonomy.test.ts`

Expected: FAIL because the default constructors still read `TAVERNARY_ENRICHMENT_*` as primary.

- [ ] **Step 3: Replace direct environment assembly**

Import and spread the Task 1 helper at every production provider construction:

```js
const provider = createEnrichmentProvider({
  ...modelProviderOptionsFromEnvironment(),
  timeoutMs: options.timeoutMs,
});
```

Use the same pattern for catalog copy, TavernKeeper synthesis, taxonomy, and
policy review providers. Change rollout planning and expected-model reads from
`TAVERNARY_ENRICHMENT_MODEL` to `UTILITY_MODEL`.

- [ ] **Step 4: Prove no direct primary inversion remains**

Run:

```powershell
rg -n "apiUrl: process\.env\.TAVERNARY_ENRICHMENT|model: process\.env\.TAVERNARY_ENRICHMENT|process\.env\.TAVERNARY_ENRICHMENT_MODEL" scripts .github/workflows
```

Expected: only the central environment adapter and intentional repair-provider wiring remain; no production caller constructs its primary provider directly from the Luna secrets.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 command plus:

`npm.cmd test -- tests/unit/generate-project-submission.test.ts tests/unit/catalog-copy-preservation.test.ts tests/unit/catalog-policy-review-provider.test.ts tests/unit/tavernkeeper-reports.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit global routing**

```powershell
git add scripts/catalog scripts/help/generate-project-owner-request.mjs scripts/security/import-tavernkeeper-reports.mjs scripts/submissions/generate-project-submission.mjs .github/workflows/review-catalog-policy.yml tests/unit
git commit -m "feat(models): route workflows through utility"
```

### Task 4: GitHub Actions credential isolation and operations contract

**Files:**
- Modify: `.github/workflows/enrich-catalog.yml`
- Modify: `.github/workflows/generate-project-submission.yml`
- Modify: `.github/workflows/generate-project-owner-request.yml`
- Modify: `.github/workflows/import-tavernkeeper-reports.yml`
- Modify: `.github/workflows/review-catalog-policy.yml`
- Modify: `tests/unit/workflows.test.ts`
- Modify: `tests/unit/refresh-github-workflow-safety.test.ts`
- Modify: `tests/unit/catalog-policy-review-workflow.test.ts`
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: `docs/tavernkeeper-integration.md`

**Interfaces:**
- Consumes: the six repository secret names and the exact model-execution steps.
- Produces: workflow YAML where both provider credential sets exist only on model steps, plus operator documentation of primary versus repair roles.

- [ ] **Step 1: Write failing workflow-secret placement tests**

Parse each workflow with YAML and assert the model step has:

```ts
expect(modelStep.env).toMatchObject({
  UTILITY_API_ENDPOINT: "${{ secrets.UTILITY_API_ENDPOINT }}",
  UTILITY_API_KEY: "${{ secrets.UTILITY_API_KEY }}",
  UTILITY_MODEL: "${{ secrets.UTILITY_MODEL }}",
  TAVERNARY_ENRICHMENT_API_URL:
    "${{ secrets.TAVERNARY_ENRICHMENT_API_URL }}",
  TAVERNARY_ENRICHMENT_API_KEY:
    "${{ secrets.TAVERNARY_ENRICHMENT_API_KEY }}",
  TAVERNARY_ENRICHMENT_MODEL:
    "${{ secrets.TAVERNARY_ENRICHMENT_MODEL }}",
});
```

Assert non-model steps and job-level `env` do not contain either API key. Assert each secret key reference occurs exactly once per workflow.

- [ ] **Step 2: Run workflow tests and verify RED**

Run: `npm.cmd test -- tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts tests/unit/catalog-policy-review-workflow.test.ts`

Expected: FAIL because `UTILITY_*` is absent and two workflows expose model credentials at job scope.

- [ ] **Step 3: Wire and isolate the secrets**

Add the three `UTILITY_*` references beside the repair credentials on each exact model-execution step. Move job-level model variables in project submission, owner request, and catalog-policy review down to those steps. Preserve non-model job variables such as issue IDs and `GH_TOKEN` at their current scope.

- [ ] **Step 4: Update operator documentation**

Document:

- `UTILITY_*` is NanoGPT/DeepSeek and performs all first-pass generation.
- `TAVERNARY_ENRICHMENT_*` is GPT-5.6 Luna and performs one JSON repair only.
- the endpoint values are complete `/chat/completions` URLs;
- repair receives no original source context and never handles transport or semantic failures;
- secret rotation must preserve both credential sets;
- this PR must remain unmerged until the TavernKeeper scanning-pass development is finished.

- [ ] **Step 5: Run workflow and documentation tests and verify GREEN**

Run: `npm.cmd test -- tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts tests/unit/catalog-policy-review-workflow.test.ts tests/unit/project-submission-docs.test.ts tests/unit/help-docs.test.ts tests/unit/tavernkeeper-reports.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit workflow isolation**

```powershell
git add .github/workflows tests/unit docs/maintenance/operations-runbook.md docs/tavernkeeper-integration.md
git commit -m "ci(models): isolate utility and repair keys"
```

### Task 5: Full verification, review, and draft PR

**Files:**
- Review every file changed since `origin/main`.
- No production file is created in this task.

**Interfaces:**
- Consumes: the complete feature branch.
- Produces: verified commits pushed to `codex/utility-json-repair` and an unmerged draft PR against `main`.

- [ ] **Step 1: Verify the exact routing contract**

Run:

```powershell
rg -n "UTILITY_API_|UTILITY_MODEL|TAVERNARY_ENRICHMENT_API_|TAVERNARY_ENRICHMENT_MODEL" scripts .github/workflows docs tests
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --check
```

Confirm all model entry points use the central helper, Luna appears only as nested repair configuration, and no secret value or live-workflow dispatch was added.

- [ ] **Step 2: Run the complete repository verification**

Run: `npm.cmd run check`

Expected: formatting, lint, palette audit, catalog validation, security report validation, catalog build, typecheck, all unit tests, production build, and static export verification exit 0.

- [ ] **Step 3: Request code review and address findings**

Review the committed diff against the design, paying particular attention to credential leakage, unexpected Luna routing, recursive repair, raw-output logging, response bounds, and primary model attribution. Fix every critical or important finding and rerun focused plus full verification.

- [ ] **Step 4: Push the reviewed branch**

Run: `git push -u origin codex/utility-json-repair`

- [ ] **Step 5: Open the draft PR without merging**

Create a draft PR against `main` describing the utility-first routing, repair-only Luna boundary, secret isolation, tests, and deliberate wait for the separate TavernKeeper scanning work. Do not dispatch provider workflows and do not merge the PR.
